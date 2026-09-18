import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Cell } from '@Store/models';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '../../utils/cellConverters';
import {
  breakCodeBlockFence,
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
