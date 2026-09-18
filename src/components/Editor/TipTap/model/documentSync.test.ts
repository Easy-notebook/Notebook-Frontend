import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Cell } from '@Store/models';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '@Editor/utils/cellConverters';
import { synchronizeDocument } from './documentSync';

const markdown = (id: string, content: string): Cell => ({
  id,
  type: 'markdown',
  content,
  outputs: [],
});

describe('document synchronization', () => {
  it('preserves markdown cell IDs through document conversion', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'A paragraph')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    expect(convertEditorStateToCells(editor).map((cell) => cell.id)).toEqual(['title', 'body']);
    editor.destroy();
  });

  it('replaces only changed top-level blocks for an external update', () => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('first', 'One'),
      markdown('second', 'Two'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const unchanged = editor.state.doc.child(2);
    expect(synchronizeDocument(editor, [cells[0], markdown('first', 'Updated'), cells[2]])).toBe(
      true
    );
    expect(editor.state.doc.child(2)).toBe(unchanged);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({ id: 'first', content: 'Updated' });
    editor.destroy();
  });

  it('retains the hybrid-cell type across HTML and document boundaries', () => {
    const cells: Cell[] = [
      markdown('title', '# Notebook'),
      {
        id: 'hybrid',
        type: 'hybrid',
        content: 'print(1)',
        outputs: [],
        language: 'python',
      },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    expect(editor.state.doc.child(1).attrs.originalType).toBe('hybrid');
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({ id: 'hybrid', type: 'hybrid' });
    editor.destroy();
  });
});
