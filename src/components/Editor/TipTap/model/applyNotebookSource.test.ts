import { afterEach, expect, it, vi } from 'vitest';
import { DOMParser } from '@tiptap/pm/model';
import { ReplaceStep } from '@tiptap/pm/transform';
import { Editor } from '@tiptap/core';
import type { Cell } from '@Store/models';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '../../utils/cellConverters';
import { reconcileSourceTransaction } from './NotebookSourceStep';
import { applyNotebookSource } from './applyNotebookSource';
import { TrailingParagraphExtension } from '../config/editorPlugins';

let editor: Editor;
afterEach(() => editor?.destroy());
it('does not dispatch or allocate undo steps for an unchanged source projection', () => {
  const cells: Cell[] = [{ id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'body', type: 'raw', content: 'Body' }];
  editor = new Editor({ extensions: getTipTapExtensions('Untitled'), content: convertCellsToHtml(cells) });
  const dispatch = vi.spyOn(editor.view, 'dispatch');
  try {
    applyNotebookSource(editor, cells, [...cells]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.commands.undo()).toBe(false);
  } finally { dispatch.mockRestore(); }
});
it.each([[500], [500, 900]])(
  'projects and replaces only changed runs in a large document (%j)',
  (...changed) => {
    const before: Cell[] = [
      { id: 'title', type: 'markdown', content: '# Notebook' },
      ...Array.from(
        { length: 1000 },
        (_, index): Cell => ({ id: `raw-${index}`, type: 'raw', content: `Text ${index}` })
      ),
    ];
    editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(before),
    });
    const original = editor.state.doc;
    const parse = vi.spyOn(DOMParser.prototype, 'parseSlice');
    let replaced = 0;
    editor.on('transaction', ({ transaction }) => {
      replaced += transaction.steps.filter((step) => step instanceof ReplaceStep).length;
    });
    try {
      const after = before.map((cell) =>
        changed.some((index) => cell.id === `raw-${index}`) ? { ...cell, content: 'Changed' } : cell
      );
      applyNotebookSource(editor, before, after);
      expect(parse).toHaveBeenCalledTimes(changed.length);
      expect(replaced).toBe(changed.length);
      expect(editor.state.doc.child(500)).toBe(original.child(500));
      expect(editor.state.doc.child(502)).toBe(original.child(502));
      expect(editor.state.doc.child(501)).not.toBe(original.child(501));
      expect(editor.commands.undo()).toBe(true);
      expect(editor.state.doc.eq(original)).toBe(true);
    } finally {
      parse.mockRestore();
    }
  }
);
it('retains new cell runtime data across removal by undo and restoration by redo', () => {
  let stored: Cell[] = [
    { id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'body', type: 'raw', content: 'Body' },
  ];
  editor = new Editor({
    extensions: [...getTipTapExtensions('Untitled'), TrailingParagraphExtension],
    content: convertCellsToHtml(stored),
    onUpdate: ({ editor, transaction }) => {
      stored = reconcileSourceTransaction(
        convertEditorStateToCells(editor),
        stored,
        transaction.steps
      );
    },
  });
  applyNotebookSource(editor, stored, [
    ...stored,
    { id: 'added', type: 'code', language: 'python', content: 'print(1)', outputs: [] },
  ]);
  const outputs = [{ type: 'text', content: 'new execution' }];
  stored = stored.map((cell) =>
    cell.id === 'added'
      ? { ...cell, outputs, description: 'Keep description', metadata: { executionCount: 1 } }
      : cell
  );
  expect(editor.commands.undo()).toBe(true);
  expect(stored.some((cell) => cell.id === 'added')).toBe(false);
  expect(editor.commands.redo()).toBe(true);
  expect(stored.find((cell) => cell.id === 'added')).toMatchObject({
    outputs,
    description: 'Keep description',
    metadata: { executionCount: 1 },
  });
  stored = stored.map((cell) => (cell.id === 'added' ? { ...cell, outputs: [] } : cell));
  editor.commands.undo();
  editor.commands.redo();
  expect(stored.find((cell) => cell.id === 'added')?.outputs).toEqual([]);
});
it('applies code edits and deletion as one undo unit, preserving latest outputs on surviving cells', () => {
  const before: Cell[] = [
    { id: 'title', type: 'markdown', content: '# Notebook' },
    {
      id: 'code',
      type: 'code',
      content: 'old',
      language: 'python',
      outputs: [{ type: 'text', content: 'old output' }],
    },
    {
      id: 'deleted',
      type: 'raw',
      content: 'restore me',
      outputs: [{ type: 'text', content: 'retained' }],
    },
  ];
  let stored = before;
  editor = new Editor({
    extensions: [...getTipTapExtensions('Untitled'), TrailingParagraphExtension],
    content: convertCellsToHtml(before),
    onUpdate: ({ editor, transaction }) => {
      stored = reconcileSourceTransaction(
        convertEditorStateToCells(editor),
        stored,
        transaction.steps
      );
    },
  });
  applyNotebookSource(editor, stored, [before[0], { ...before[1], content: 'new' }]);
  expect(stored.map((cell) => cell.id)).toEqual(['title', 'code']);
  expect(stored[1].content).toBe('new');
  const outputs = [{ type: 'text', content: 'latest output' }];
  stored = stored.map((cell) => (cell.id === 'code' ? { ...cell, outputs } : cell));
  expect(editor.commands.undo()).toBe(true);
  expect(stored[1].content).toBe('old');
  expect(stored[1].outputs).toBe(outputs);
  expect(stored[2]).toMatchObject(before[2]);
  expect(editor.commands.redo()).toBe(true);
  expect(stored).toHaveLength(2);
  expect(stored[1].content).toBe('new');
  expect(stored[1].outputs).toBe(outputs);
});
