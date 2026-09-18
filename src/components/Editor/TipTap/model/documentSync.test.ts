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

  it('keeps the caret in the same Markdown cell after an external reorder', () => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('first', 'One'),
      markdown('second', 'Two'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 2);
    expect(synchronizeDocument(editor, [cells[0], cells[2], cells[1]])).toBe(true);
    expect(convertEditorStateToCells(editor).map((cell) => cell.id)).toEqual([
      'title',
      'second',
      'first',
    ]);
    const index = editor.state.doc.resolve(editor.state.selection.anchor).index(0);
    expect(editor.state.doc.child(index).attrs.cellId).toBe('first');
    editor.destroy();
  });

  it('keeps local Markdown edits in the editor undo history', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'One')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    editor.commands.insertContentAt(editor.state.doc.child(0).nodeSize + 2, 'X');
    expect(convertEditorStateToCells(editor)[1].content).toBe('XOne');
    expect(editor.commands.undo()).toBe(true);
    expect(convertEditorStateToCells(editor)[1].content).toBe('One');
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

  it.each(['graph TD\nA-->B', 'this is not valid Mermaid syntax'])(
    'preserves Mermaid source in a Markdown cell: %s',
    (source) => {
      const content = `Before\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nAfter`;
      const cells = [markdown('title', '# Notebook'), markdown('diagram', content)];
      const editor = new Editor({
        extensions: getTipTapExtensions('Untitled'),
        content: convertCellsToHtml(cells),
      });
      expect(editor.state.doc.child(1).child(1).type.name).toBe('mermaidBlock');
      expect(convertEditorStateToCells(editor)[1]).toMatchObject({ id: 'diagram', content });
      editor.destroy();
    }
  );

  it.each([
    { id: 'code', type: 'code', content: 'print(1)', language: 'python', outputs: [] },
    { id: 'image', type: 'image', content: '![alt](https://example.com/image.png)', outputs: [] },
    { id: 'thinking', type: 'thinking', content: '', outputs: [] },
    { id: 'raw', type: 'raw', content: '<not markdown>', outputs: [] },
    { id: 'link', type: 'link', content: '[file](https://example.com/file.txt)', outputs: [] },
  ] as Cell[])('keeps $type cell identity and content through a document round trip', (cell) => {
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml([markdown('title', '# Notebook'), cell]),
    });
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({
      id: cell.id,
      type: cell.type,
      content: cell.content,
    });
    editor.destroy();
  });
});
