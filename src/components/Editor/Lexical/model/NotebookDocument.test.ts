import { registerFenceInput } from '../plugins/FenceInputPlugin';
import { INSERT_PARAGRAPH_COMMAND, $createParagraphNode } from 'lexical';
import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { registerDocumentBehavior } from '../plugins/DocumentBehaviorPlugin';
import { KEY_ENTER_COMMAND, UNDO_COMMAND, REDO_COMMAND } from 'lexical';
import { breakCellFence, previewCellSource } from '../interaction/SourceTransitions';
import { buildEditorFromExtensions } from '@lexical/extension';
import { $getRoot, $createTextNode } from 'lexical';
import { createNotebookExtension, $readCells } from './NotebookDocument';
import { NotebookCellNode } from './NotebookCellNode';
import { NotebookPluginRegistry } from '../extensionPoints';
import { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import useStore from '@Store/notebookStore';
import type { Cell } from '@Store/models';
const cells: Cell[] = [
  { id: 'title', type: 'markdown', content: '# Notebook', outputs: [] },
  {
    id: 'body',
    type: 'markdown',
    content: '## Heading\n\n**bold** and `code`\n\n3. third\n4. fourth',
    outputs: [],
  },
  { id: 'code', type: 'code', content: 'print(1)', outputs: [], metadata: { language: 'python' } },
];
function setup() {
  const editor = buildEditorFromExtensions(
    createNotebookExtension(cells, false, new NotebookPluginRegistry([]))
  );
  editor.update(() => {}, { discrete: true });
  const session = new NotebookEditorSession(editor, 'test');
  session.attach();
  return {
    editor,
    session,
    close: () => {
      session.dispose();
      editor.dispose();
    },
  };
}
beforeEach(() => {
  useStore.setState({ notebookId: 'test', cells });
});
describe('notebook document ownership', () => {
  it('round trips untouched rich and embedded cells without normalizing their source', () => {
    const { editor, session, close } = setup();
    expect(
      editor.getEditorState().read(() => $readCells((id) => session.cell(id)), { editor })
    ).toEqual(cells);
    close();
  });
  it('publishes rich edits and retains cell identity and execution outputs', () => {
    const { editor, close } = setup();
    editor.update(
      () => {
        const cell = $getRoot().getFirstChild() as NotebookCellNode;
        cell.getFirstChild()!.getParentOrThrow().getFirstChildOrThrow();
        (cell.getFirstChild() as import('lexical').ElementNode).append($createTextNode(' revised'));
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[0].content).toBe('# Notebook revised');
    expect(useStore.getState().cells[2].id).toBe(cells[2].id);
    expect(useStore.getState().cells[2].outputs).toEqual(cells[2].outputs);
    close();
  });
  it('receives external edits and reordering without changing unaffected node keys', () => {
    const { editor, session, close } = setup();
    const key = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());
    const updated = { ...cells[1], content: '## Agent update' };
    useStore.getState().setCells([cells[0], cells[2], updated]);
    const projected = editor.getEditorState().read(
      () => ({
        cells: $readCells((id) => session.cell(id)),
        key: $getRoot().getChildAtIndex(1)!.getKey(),
      }),
      { editor }
    );
    expect(projected.cells.map(({ id, content }) => ({ id, content }))).toEqual(
      [cells[0], cells[2], updated].map(({ id, content }) => ({ id, content }))
    );
    expect(projected.key).toBe(key);
    close();
  });
  it('isolates sessions on notebook navigation and supports StrictMode attachment replay', () => {
    const { session, close } = setup();
    session.dispose();
    session.attach();
    useStore.setState({ notebookId: 'other', cells: [] });
    session.insert({ id: 'late', type: 'markdown', content: 'late', outputs: [] });
    expect(useStore.getState().cells).toEqual([]);
    close();
  });
  it('undoes source transitions without dropping executable identity or outputs', async () => {
    const { editor, session, close } = setup();
    const detach = registerHistory(editor, createEmptyHistoryState(), 0);
    editor.update(
      () => {
        ($getRoot().getFirstChild() as NotebookCellNode).selectEnd();
      },
      { discrete: true }
    );
    session.replace(breakCellFence(cells[2]));
    expect(useStore.getState().cells[2].type).toBe('markdown');
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(useStore.getState().cells[2].type).toBe('code');
    expect(useStore.getState().cells[2].content).toBe('print(1)');
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(useStore.getState().cells[2].metadata?.editorMode).toBe('source');
    detach();
    close();
  });
  it('rejects a stale source draft and restores repaired fences with the same cell id', () => {
    const { session, close } = setup();
    session.replace(breakCellFence(cells[2]));
    const source = useStore.getState().cells[2];
    expect(session.updateSource(source.id, 'stale', 'overwritten')).toBe(false);
    const fixed = { ...source, content: '```python\nprint(2)\n```' };
    session.replace(previewCellSource(fixed));
    expect(useStore.getState().cells[2].id).toBe('code');
    expect(useStore.getState().cells[2].content).toBe('print(2)');
    close();
  });
  it('splits a title into a body cell while retaining the title identity', () => {
    const { editor, close } = setup();
    const detach = registerDocumentBehavior(editor);
    editor.update(
      () => {
        const cell = $getRoot().getFirstChild() as NotebookCellNode;
        const text = cell.getFirstDescendant() as import('lexical').TextNode;
        text.select(4, 4);
        editor.dispatchCommand(
          KEY_ENTER_COMMAND,
          new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
        );
      },
      { discrete: true }
    );
    const next = useStore.getState().cells;
    expect(next[0].id).toBe('title');
    expect(next[0].content).toBe('# Note');
    expect(next[1].content).toBe('book');
    expect(next[2].id).toBe('body');
    detach();
    close();
  });
  it('refuses source writes in read-only mode', () => {
    const { editor, session, close } = setup();
    editor.setEditable(false);
    expect(session.updateSource('code', 'print(1)', 'print(2)')).toBe(false);
    session.remove('code');
    expect(useStore.getState().cells).toEqual(cells);
    close();
  });
  it('does not undo across an external authored update', async () => {
    const { editor, session, close } = setup();
    const detach = registerHistory(editor, createEmptyHistoryState(), 0);
    editor.update(
      () => {
        ($getRoot().getFirstChild() as NotebookCellNode).selectEnd();
      },
      { discrete: true }
    );
    session.replace(breakCellFence(cells[2]));
    const latest = useStore.getState().cells;
    useStore
      .getState()
      .setCells(
        latest.map((cell) => (cell.id === 'code' ? { ...cell, content: 'external source' } : cell))
      );
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(useStore.getState().cells.find((cell) => cell.id === 'code')?.content).toBe(
      'external source'
    );
    detach();
    close();
  });
  it('keeps consecutive embedded inserts in their requested order', () => {
    const { editor, session, close } = setup();
    editor.update(
      () => {
        ($getRoot().getFirstChild() as NotebookCellNode).selectEnd();
      },
      { discrete: true }
    );
    for (const id of ['first-upload', 'second-upload'])
      session.insert({ id, type: 'link', content: `[${id}](file.csv)`, outputs: [] });
    expect(useStore.getState().cells.map((cell) => cell.id)).toEqual([
      'title',
      'first-upload',
      'second-upload',
      'body',
      'code',
    ]);
    close();
  });
  it.each(['keyboard', 'beforeinput'])(
    'promotes an AAL fence between paragraphs via %s and preserves both sides',
    (path) => {
      const { editor, session, close } = setup();
      const detach = registerFenceInput(editor, session);
      editor.update(
        () => {
          const cell = $getRoot().getChildAtIndex(1) as NotebookCellNode;
          cell.clear();
          const fence = $createParagraphNode().append($createTextNode('```AAL'));
          cell.append(
            $createParagraphNode().append($createTextNode('before')),
            fence,
            $createParagraphNode().append($createTextNode('after'))
          );
          fence.selectEnd();
        },
        { discrete: true }
      );
      editor.update(
        () => {
          if (path === 'keyboard')
            editor.dispatchCommand(
              KEY_ENTER_COMMAND,
              new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
            );
          else editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
        },
        { discrete: true }
      );
      const next = useStore.getState().cells;
      expect(next.slice(1, 4).map((cell) => [cell.type, cell.content])).toEqual([
        ['markdown', 'before'],
        ['code', ''],
        ['markdown', 'after'],
      ]);
      expect(next[1].id).toBe('body');
      expect(next[2].language).toBe('aal');
      expect(next[4].id).toBe('code');
      detach();
      close();
    }
  );
  it('preserves the cell id when the fence is its only paragraph', () => {
    const { editor, session, close } = setup();
    const detach = registerFenceInput(editor, session);
    editor.update(
      () => {
        const cell = $getRoot().getChildAtIndex(1) as NotebookCellNode;
        cell.clear().append($createParagraphNode().append($createTextNode('```python')));
        cell.selectEnd();
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      },
      { discrete: true }
    );
    expect(useStore.getState().cells[1]).toMatchObject({
      id: 'body',
      type: 'code',
      language: 'python',
      content: '',
    });
    detach();
    close();
  });
});
