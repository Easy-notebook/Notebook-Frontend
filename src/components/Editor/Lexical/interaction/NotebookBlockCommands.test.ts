import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEditorFromExtensions } from '@lexical/extension';
import {
  $getRoot,
  $getNodeByKey,
  $isElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { registerNotebookHistory } from '../plugins/NotebookHistoryPlugin';
import { createNotebookExtension } from '../model/NotebookDocument';
import { NotebookPluginRegistry } from '../extensionPoints';
import { PersistentBlockExtension } from '../blocks/PersistentBlockExtension';
import { ColumnsExtension } from '../columns/ColumnsExtension';
import { NotebookEditorSession } from './NotebookEditorSession';
import { NotebookBlockCommands } from './NotebookBlockCommands';
import { registerCellBoundaryNavigation } from './CellBoundaryNavigation';
import { registerDocumentBehavior } from '../plugins/DocumentBehaviorPlugin';
import useStore from '@Store/notebookStore';
import type { Cell } from '@Store/models';
const cells: Cell[] = [
  { id: 'title', type: 'markdown', content: '# Notebook', outputs: [] },
  { id: 'body', type: 'markdown', content: 'First **bold**\n\nSecond', outputs: [] },
  { id: 'code', type: 'code', language: 'aal', content: 'return 42', outputs: [] },
  { id: 'after', type: 'markdown', content: 'After', outputs: [] },
];
const registry = new NotebookPluginRegistry([
  { id: 'blocks', extensions: [PersistentBlockExtension, ColumnsExtension] },
]);
function setup(source = cells) {
  useStore.setState({ notebookId: 'blocks-test', cells: source });
  const editor = buildEditorFromExtensions(createNotebookExtension(source, false, registry));
  editor.update(() => {}, { discrete: true });
  const session = new NotebookEditorSession(editor, 'blocks-test');
  session.attach();
  const history = registerNotebookHistory(editor);
  const behavior = registerDocumentBehavior(editor);
  const boundary = registerCellBoundaryNavigation(editor, session);
  const commands = new NotebookBlockCommands(session);
  const keys = editor.read(() => ({
    first: ($getRoot().getChildAtIndex(1) as import('lexical').ElementNode)
      .getFirstDescendant()!
      .getParentOrThrow()
      .getKey(),
    second: ($getRoot().getChildAtIndex(1) as import('lexical').ElementNode)
      .getLastChildOrThrow()
      .getKey(),
    code: $getRoot().getChildAtIndex(2)!.getKey(),
    after: ($getRoot().getChildAtIndex(3) as import('lexical').ElementNode)
      .getFirstChildOrThrow()
      .getKey(),
  }));
  return {
    editor,
    session,
    commands,
    keys,
    close: () => {
      boundary();
      behavior();
      history();
      session.dispose();
      editor.dispose();
    },
  };
}
beforeEach(() => vi.restoreAllMocks());
describe('notebook block transactions', () => {
  it('copies only the selected block, with formatting and executable fences', () => {
    const t = setup();
    expect(t.commands.describe(t.keys.first)?.markdown.trim()).toBe('First **bold**');
    expect(t.commands.describe(t.keys.code)?.markdown).toContain('```aal\nreturn 42');
    t.close();
  });
  it('moves a single paragraph across code without moving its cell siblings', () => {
    const t = setup();
    t.commands.move(t.keys.first, t.keys.code, true);
    expect(useStore.getState().cells.map((c) => c.content.trim())).toEqual([
      '# Notebook',
      'Second',
      'return 42',
      'First **bold**',
      'After',
    ]);
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(useStore.getState().cells.map((c) => c.content)).toEqual(cells.map((c) => c.content));
    t.close();
  });
  it('can undo the first menu action after an external document reset', () => {
    const t = setup();
    useStore
      .getState()
      .setCells(cells.map((c) => (c.id === 'body' ? { ...c, content: 'Reset paragraph' } : c)));
    const key = t.editor.read(() =>
      ($getRoot().getChildAtIndex(1) as import('lexical').ElementNode)
        .getFirstChildOrThrow()
        .getKey()
    );
    t.commands.duplicate(key);
    expect(useStore.getState().cells[1].content.match(/Reset paragraph/g)).toHaveLength(2);
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(useStore.getState().cells[1].content).toBe('Reset paragraph');
    t.close();
  });
  it('splits a markdown owner to insert an executable cell at the actual block boundary', () => {
    const t = setup();
    t.commands.insert(t.keys.first, 'code');
    expect(useStore.getState().cells.map((c) => [c.type, c.content.trim()])).toEqual([
      ['markdown', '# Notebook'],
      ['markdown', 'First **bold**'],
      ['code', ''],
      ['markdown', 'Second'],
      ['code', 'return 42'],
      ['markdown', 'After'],
    ]);
    t.close();
  });
  it('duplicates with fresh IDs and makes deletion undoable', () => {
    const t = setup();
    t.commands.duplicate(t.keys.code);
    const duplicated = useStore.getState().cells.filter((c) => c.type === 'code');
    expect(duplicated).toHaveLength(2);
    expect(new Set(duplicated.map((c) => c.id)).size).toBe(2);
    t.commands.delete(t.keys.first);
    expect(useStore.getState().cells[1].content.trim()).toBe('Second');
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(useStore.getState().cells[1].content).toContain('First **bold**');
    t.close();
  });
  it('round trips fold state, labels, colors and columns through persisted markdown', () => {
    const t = setup();
    t.commands.decorate(t.keys.first, {
      kind: 'toggle',
      title: 'Evidence',
      collapsed: true,
      foreground: '#123456',
    });
    t.commands.columns(t.keys.second, 2);
    const persisted = useStore.getState().cells;
    expect(persisted[1].content).toContain('notebook:block');
    expect(persisted[1].content).toContain('Evidence');
    expect(persisted[1].content).toContain('notebook:columns');
    t.close();
    const restored = setup(persisted);
    expect(useStore.getState().cells).toEqual(persisted);
    expect(restored.editor.read(() => $getRoot().getTextContent())).toContain('First bold');
    restored.close();
  });
  it('protects adjacent code on Backspace and Delete while transferring focus', () => {
    const t = setup();
    const focus = vi.spyOn(t.session, 'focusEmbeddedCell').mockImplementation(() => {});
    t.editor.update(
      () => {
        const n = $getNodeByKey(t.keys.after);
        if ($isElementNode(n)) n.selectStart();
      },
      { discrete: true }
    );
    t.editor.dispatchCommand(
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Backspace' })
    );
    t.editor.update(() => {}, { discrete: true });
    expect(focus).toHaveBeenCalledWith('code', 'up');
    expect(useStore.getState().cells).toEqual(cells);
    t.editor.update(
      () => {
        const n = $getNodeByKey(t.keys.second);
        if ($isElementNode(n)) n.selectEnd();
      },
      { discrete: true }
    );
    t.editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown', { key: 'Delete' }));
    t.editor.update(() => {}, { discrete: true });
    expect(focus).toHaveBeenCalledWith('code', 'down');
    expect(useStore.getState().cells).toEqual(cells);
    t.close();
  });
  it.each(['> Evidence', '## Evidence'])(
    'demotes %s on initial Backspace without merging the previous cell',
    (content) => {
      const source = cells.map((c) => (c.id === 'body' ? { ...c, content } : c));
      const t = setup(source);
      t.editor.update(
        () => {
          const node = $getNodeByKey(t.keys.first);
          if ($isElementNode(node)) node.selectStart();
        },
        { discrete: true }
      );
      t.editor.dispatchCommand(
        KEY_BACKSPACE_COMMAND,
        new KeyboardEvent('keydown', { key: 'Backspace' })
      );
      t.editor.update(() => {}, { discrete: true });
      expect(useStore.getState().cells[0].content).toBe('# Notebook');
      expect(useStore.getState().cells[1].content.trim()).toBe('Evidence');
      t.editor.dispatchCommand(UNDO_COMMAND, undefined);
      t.editor.update(() => {}, { discrete: true });
      expect(useStore.getState().cells[1].content).toBe(content);
      t.close();
    }
  );
  it('keeps consecutive metadata edits on the same block after introducing its wrapper', () => {
    const t = setup();
    t.commands.decorate(t.keys.first, { foreground: '#112233' });
    t.commands.decorate(t.keys.first, { background: '#abcdef' });
    expect(t.commands.describe(t.keys.first)?.metadata).toMatchObject({
      foreground: '#112233',
      background: '#abcdef',
    });
    t.commands.decorate(t.keys.first, { foreground: null, background: null });
    expect(t.commands.describe(t.keys.first)?.metadata).toMatchObject({
      foreground: null,
      background: null,
    });
    t.close();
  });
  it('rejects stale notebook sessions and read-only mutations', () => {
    const t = setup();
    t.editor.setEditable(false);
    t.commands.delete(t.keys.code);
    expect(useStore.getState().cells).toEqual(cells);
    t.editor.setEditable(true);
    useStore.setState({ notebookId: 'other' });
    t.commands.delete(t.keys.code);
    expect(useStore.getState().cells).toEqual(cells);
    t.close();
  });
});
