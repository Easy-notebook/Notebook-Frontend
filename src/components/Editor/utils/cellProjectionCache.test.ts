import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { getTipTapExtensions } from '../TipTap/config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from './cellConverters';

let editor: Editor;
afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
});
it('serializes only changed immutable blocks across a 1000-cell text transaction', () => {
  const cells = [
    { id: 'title', type: 'markdown' as const, content: '# Notebook' },
    ...Array.from({ length: 1000 }, (_, index) => ({
      id: `text-${index}`,
      type: 'markdown' as const,
      content: `Body ${index}`,
    })),
  ];
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml(cells),
  });
  const before = convertEditorStateToCells(editor);
  const serialize = vi.spyOn(ProseMirrorNode.prototype, 'toJSON');
  expect(convertEditorStateToCells(editor)).toBe(before);
  expect(serialize).not.toHaveBeenCalled();
  let position = 0;
  editor.state.doc.forEach((node, offset) => {
    if (node.attrs.cellId === 'text-500') position = offset + 2;
  });
  editor.view.dispatch(editor.state.tr.insertText('Changed ', position));
  serialize.mockClear();
  const after = convertEditorStateToCells(editor);
  expect(serialize).toHaveBeenCalledTimes(3); // Changed wrapper, paragraph and text only.
  expect(after).toHaveLength(1001);
  after.forEach((cell, index) => {
    if (cell.id === 'text-500') expect(cell.content).toBe('Changed Body 500');
    else expect(cell).toBe(before[index]);
  });
  serialize.mockClear();
  expect(convertEditorStateToCells(editor)).toBe(after);
  expect(serialize).not.toHaveBeenCalled();
});
