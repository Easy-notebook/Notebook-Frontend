import { describe, expect, it, vi } from 'vitest';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
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
  it.each(['## Heading', '- one\n- two', '```mermaid\ngraph TD; A-->B\n```', ''])(
    'preserves cell boundaries when externally changing the block structure: %s',
    (content) => {
      const cells = [
        markdown('title', '# Notebook'),
        markdown('body', 'Original'),
        markdown('after', 'Untouched'),
      ];
      const editor = new Editor({
        extensions: getTipTapExtensions('Untitled'),
        content: convertCellsToHtml(cells),
      });
      try {
        synchronizeDocument(editor, [cells[0], markdown('body', content), cells[2]]);
        const projected = convertEditorStateToCells(editor);
        expect(projected.map((cell) => cell.id)).toEqual(['title', 'body', 'after']);
        expect(projected[2].content).toBe('Untouched');
        expect(editor.state.doc.child(1).type.name).toBe('markdownCell');
      } finally {
        editor.destroy();
      }
    }
  );
  it('parses only one changed cell in a 1000-cell notebook', () => {
    const cells = [
      markdown('title', '# Notebook'),
      ...Array.from({ length: 1000 }, (_, i) => markdown(`body-${i}`, `Paragraph ${i}`)),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const spy = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
    try {
      const next = [...cells];
      next[501] = { ...next[501], content: 'Changed paragraph' };
      synchronizeDocument(editor, next);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(convertEditorStateToCells(editor)[501].content).toBe('Changed paragraph');
      spy.mockClear();
      synchronizeDocument(editor, next);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      editor.destroy();
    }
  }, 20000);

  it('maps a non-empty text selection through an external insertion in the same cell', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'Hello world')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const start = editor.state.doc.firstChild!.nodeSize + 2;
    editor.commands.setTextSelection({ from: start + 6, to: start + 11 });
    synchronizeDocument(editor, [cells[0], markdown('body', 'Hello brave world')]);
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    ).toBe('world');
    expect(editor.state.selection.empty).toBe(false);
    editor.destroy();
  });
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
