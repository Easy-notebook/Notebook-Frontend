import { describe, expect, it } from 'vitest';
import { buildEditorFromExtensions } from '@lexical/extension';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  UNDO_COMMAND,
  type ElementNode,
} from 'lexical';
import { type TableNode } from '@lexical/table';
import { createNotebookExtension } from '../model/NotebookDocument';
import { NotebookPluginRegistry } from '../extensionPoints';
import {
  MarkdownTableSemanticsExtension,
  $getMarkdownTableAlignments,
} from '../model/MarkdownTable';
import { registerNotebookHistory } from '../plugins/NotebookHistoryPlugin';
import { TableEditingController } from './TableEditingController';

function setup() {
  const registry = new NotebookPluginRegistry([
    { id: 'table', extensions: [MarkdownTableSemanticsExtension] },
  ]);
  const editor = buildEditorFromExtensions(
    createNotebookExtension(
      [
        {
          id: 'table',
          type: 'markdown',
          content: '| A | B |\n| :--- | ---: |\n| 1 | 2 |',
          outputs: [],
        },
      ],
      false,
      registry
    )
  );
  editor.update(
    () => {
      const table = (
        $getRoot().getFirstChildOrThrow() as ElementNode
      ).getFirstChildOrThrow() as TableNode;
      (table.getFirstChildOrThrow() as ElementNode).getFirstChildOrThrow().selectStart();
    },
    { discrete: true }
  );
  const history = registerNotebookHistory(editor);
  const controller = new TableEditingController(editor);
  const alignments = () =>
    editor.read(() =>
      $getMarkdownTableAlignments(
        ($getRoot().getFirstChildOrThrow() as ElementNode).getFirstChildOrThrow() as TableNode
      )
    );
  return {
    editor,
    controller,
    alignments,
    close: () => {
      history();
      editor.dispose();
    },
  };
}
describe('table editing transactions', () => {
  it('inserts and deletes columns without shifting existing alignment metadata', () => {
    const t = setup();
    t.controller.run('insert-column-before');
    expect(t.controller.readState()?.columnCount).toBe(3);
    expect(t.alignments()).toEqual([null, 'left', 'right']);
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(t.alignments()).toEqual(['left', 'right']);
    t.close();
  });
  it('recovers an editable paragraph when the last table is removed, and restores it with undo', () => {
    const t = setup();
    t.controller.run('delete-table');
    expect(
      t.editor.read(() =>
        ($getRoot().getFirstChildOrThrow() as ElementNode).getFirstChildOrThrow().getType()
      )
    ).toBe('paragraph');
    expect(t.editor.read(() => $isRangeSelection($getSelection()))).toBe(true);
    t.editor.dispatchCommand(UNDO_COMMAND, undefined);
    t.editor.update(() => {}, { discrete: true });
    expect(t.controller.readState()?.columnCount).toBe(2);
    t.close();
  });
  it('does not mutate tables while read only', () => {
    const t = setup();
    t.editor.setEditable(false);
    t.controller.run('delete-table');
    expect(t.controller.readState()?.columnCount).toBe(2);
    t.close();
  });
});
