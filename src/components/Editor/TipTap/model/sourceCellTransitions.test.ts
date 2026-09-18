import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Editor } from '@tiptap/core';
import type { Cell } from '@Store/models';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '../../utils/cellConverters';
import {
  breakCodeBlockFence,
  breakNestedCodeFence,
  editSelectedCellSource,
  previewMarkdownSource,
} from './sourceCellTransitions';
import { reconcileCells } from './reconcileCells';
import { synchronizeDocument } from './documentSync';

let editor: Editor;
const markdown = (id: string, content: string): Cell => ({
  id,
  type: 'markdown',
  content,
  outputs: [],
});
function create(cell: Cell) {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml([
      markdown('title', '# Notebook'),
      cell,
      markdown('after', 'Untouched'),
    ]),
  });
  return editor.state.doc.firstChild!.nodeSize;
}
afterEach(() => editor?.destroy());

describe('source cell transitions', () => {
  it('round trips nested lists, quoted code, images and math through the notebook parser', () => {
    const content =
      '10. first\n\n    second\n\n    - nested\n11. next\n\n> quoted\n>\n> ```python\n> print(1)\n> ```\n\nFormula $x^2$ and ![alt](https://example.com/a.png)';
    const pos = create(markdown('nested', content));
    const body = editor.state.doc.nodeAt(pos)!;
    expect(body.firstChild?.type.name).toBe('orderedList');
    expect(body.firstChild?.attrs.start).toBe(10);
    expect(body.firstChild?.firstChild?.child(2).type.name).toBe('bulletList');
    expect(body.child(1).lastChild?.type.name).toBe('fencedCodeBlock');
    const types: string[] = [];
    body.descendants((node) => {
      types.push(node.type.name);
    });
    expect(types).toContain('latexBlock');
    expect(types).toContain('markdownImage');
    editor.commands.setTextSelection(pos + 4);
    expect(editSelectedCellSource(editor)).toBe(true);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const restored = editor.state.doc.nodeAt(pos)!;
    expect(restored.firstChild?.eq(body.firstChild!)).toBe(true);
    expect(restored.child(1).eq(body.child(1))).toBe(true);
    expect(restored.lastChild?.eq(body.lastChild!)).toBe(true);
  });
  it('serializes only the selected cell when opening source in a 1000-cell document', () => {
    editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(
        Array.from({ length: 1000 }, (_, index) =>
          markdown(`cell-${index}`, index ? 'Body' : '# Title')
        )
      ),
    });
    const pos = editor.state.doc.firstChild!.nodeSize;
    editor.commands.setTextSelection(pos + 2);
    const serialize = vi.spyOn(ProseMirrorNode.prototype, 'toJSON');
    try {
      expect(editSelectedCellSource(editor)).toBe(true);
      expect(serialize).toHaveBeenCalledTimes(2);
      expect(editor.state.doc.nodeAt(pos)?.attrs.source).toBe('Body');
    } finally {
      serialize.mockRestore();
    }
  });
  it('breaks a nested fence while retaining siblings, cell identity, caret and undo', () => {
    const content = 'Before\n\n~~~python\nprint(1)\n~~~\n\nAfter';
    const pos = create(markdown('mixed', content));
    const original = editor.state.doc;
    const cell = original.nodeAt(pos)!;
    editor.commands.setTextSelection(pos + 1 + cell.firstChild!.nodeSize + 1);
    expect(
      editor.view.someProp('handleKeyDown', (handler) =>
        handler(editor.view, new KeyboardEvent('keydown', { key: 'Backspace' }))
      )
    ).toBe(true);
    const source = editor.state.doc.nodeAt(pos)!;
    expect(source.attrs.source).toBe('Before\n\n~~python\nprint(1)\n~~~\n\nAfter');
    expect(source.attrs.caret).toBe('Before\n\n~~'.length);
    expect(source.attrs.cellId).toBe('mixed');
    expect(editor.state.doc.lastChild).toBe(original.lastChild);
    editor.commands.undo();
    expect(editor.state.doc.eq(original)).toBe(true);
  });
  it('does not convert a nested fence during ordinary character deletion or selection', () => {
    const pos = create(markdown('mixed', 'Before\n\n```python\nprint(1)\n```'));
    const start = pos + 2 + editor.state.doc.nodeAt(pos)!.firstChild!.nodeSize;
    editor.commands.setTextSelection(start + 1);
    expect(breakNestedCodeFence(editor)).toBe(false);
    editor.commands.setTextSelection({ from: start, to: start + 1 });
    expect(breakNestedCodeFence(editor)).toBe(false);
  });
  it('preserves code outputs through HTML import and export', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [{ output_type: 'stream', text: '1' } as any],
    };
    create(cell);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
    const html = editor.getHTML();
    editor.commands.setContent(html);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
  });
  it('round trips mixed code and Mermaid fences without executing nested code', () => {
    const content =
      'Example\n\n````markdown\n```mermaid\ngraph TD; A-->B\n```\n````\n\n~~~mermaid\ngraph TD; B-->C\n~~~';
    const pos = create({ ...markdown('mixed', content), metadata: { editorMode: 'source' } });
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const types: string[] = [];
    editor.state.doc.child(1).forEach((node) => types.push(node.type.name));
    expect(types).toEqual(['paragraph', 'fencedCodeBlock', 'mermaidBlock']);
    expect(convertEditorStateToCells(editor)[1].content).toBe(content);
  });
  it('breaks the opening fence without losing code, language, ID or neighboring cells', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'javascript',
      content: 'old',
      outputs: [],
    };
    const pos = create(cell);
    expect(breakCodeBlockFence(editor, pos, { ...cell, content: 'const x = "<tag>";\n\n' })).toBe(
      true
    );
    const cells = convertEditorStateToCells(editor);
    expect(cells.map((cell) => cell.id)).toEqual(['title', 'code', 'after']);
    expect(cells[1]).toMatchObject({
      type: 'markdown',
      content: '``javascript\nconst x = "<tag>";\n\n\n```',
      metadata: { editorMode: 'source' },
    });
    expect(cells[2].content).toBe('Untouched');
    const reload = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    expect(convertEditorStateToCells(reload)[1]).toMatchObject(cells[1]);
    reload.destroy();
  });

  it('undo restores the newest store-backed code rather than the original node content', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'old',
      outputs: [],
    };
    const pos = create(cell);
    breakCodeBlockFence(editor, pos, { ...cell, content: 'print("latest")' });
    expect(editor.commands.undo()).toBe(true);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({
      id: 'code',
      type: 'code',
      content: 'print("latest")',
    });
    expect(editor.commands.redo()).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('markdownSourceCell');
  });

  it('repairs a broken fence into an executable code cell', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [],
    };
    const pos = create(cell);
    breakCodeBlockFence(editor, pos, cell);
    const node = editor.state.doc.nodeAt(pos)!;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        source: '`' + node.attrs.source,
      })
    );
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
  });

  it('persists source mode and exits it even when Markdown text did not change', () => {
    const cell = markdown('body', 'Hello');
    const pos = create(cell);
    editor.commands.setTextSelection(pos + 2);
    expect(editSelectedCellSource(editor)).toBe(true);
    const sourceCells = convertEditorStateToCells(editor);
    expect(sourceCells[1].metadata?.editorMode).toBe('source');
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const cells = reconcileCells(convertEditorStateToCells(editor), sourceCells);
    expect(cells[1].metadata?.editorMode).toBeUndefined();
    synchronizeDocument(editor, cells);
    expect(editor.state.doc.child(1).type.name).toBe('markdownCell');
  });

  it('previews Mermaid source as a diagram without turning it into executable Python', () => {
    const cell = {
      ...markdown('diagram', '```mermaid\ngraph TD; A-->B\n```'),
      metadata: { editorMode: 'source' },
    };
    const pos = create(cell);
    previewMarkdownSource(editor, pos);
    expect(editor.state.doc.child(1).firstChild?.type.name).toBe('mermaidBlock');
    expect(convertEditorStateToCells(editor)[1].content).toBe(cell.content);
  });
});
