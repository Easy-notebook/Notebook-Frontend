import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '../../utils/cellConverters';
import { synchronizeDocument } from './documentSync';

let editor: Editor;
afterEach(() => editor?.destroy());

function createTitle(content = '# ') {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml([{ id: 'title', type: 'markdown', content, outputs: [] }]),
  });
  editor.commands.setTextSelection(1);
  return editor;
}

function pressEnter() {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));
}

describe('title editing', () => {
  it('does not add Markdown escapes to the plain notebook title on reload', () => {
    createTitle('# A & B *literal*');
    const cells = convertEditorStateToCells(editor);
    expect(cells[0].content).toBe('# A & B *literal*');
    editor.commands.setContent(convertCellsToHtml(cells));
    expect(editor.state.doc.firstChild?.textContent).toBe('A & B *literal*');
  });
  it('keeps an empty title empty through persistence and reload', () => {
    createTitle();
    expect(editor.state.doc.firstChild?.textContent).toBe('');
    const cells = convertEditorStateToCells(editor);
    expect(cells[0]).toMatchObject({ id: 'title', content: '# ' });
    synchronizeDocument(editor, cells);
    expect(editor.state.doc.firstChild?.textContent).toBe('');
  });

  it('creates a persisted empty cell on Enter and keeps the caret there', () => {
    createTitle();
    expect(pressEnter()).toBe(true);
    const cells = convertEditorStateToCells(editor);
    expect(cells).toHaveLength(2);
    expect(cells[1]).toMatchObject({ type: 'markdown', content: '' });
    expect(editor.state.selection.$from.node(1).attrs.cellId).toBe(cells[1].id);
    synchronizeDocument(editor, cells);
    expect(editor.state.selection.$from.node(1).attrs.cellId).toBe(cells[1].id);
    editor.commands.insertContent('正文');
    expect(convertEditorStateToCells(editor).map((cell) => cell.content)).toEqual(['# ', '正文']);
  });

  it('types without placeholder residue and can clear the title', () => {
    createTitle();
    editor.commands.insertContent('我的标题');
    expect(convertEditorStateToCells(editor)[0].content).toBe('# 我的标题');
    editor.commands.deleteRange({ from: 1, to: editor.state.doc.firstChild!.nodeSize - 1 });
    expect(convertEditorStateToCells(editor)[0].content).toBe('# ');
  });

  it('moves title text after the caret into the new cell and supports undo', () => {
    createTitle('# Hello world');
    editor.commands.setTextSelection(6);
    pressEnter();
    expect(convertEditorStateToCells(editor).map((cell) => cell.content)).toEqual([
      '# Hello',
      ' world',
    ]);
    editor.commands.undo();
    expect(editor.state.doc.firstChild?.textContent).toBe('Hello world');
  });

  it('preserves intentionally entered Untitled and literal HTML characters', () => {
    createTitle('# Untitled <draft> & notes');
    expect(editor.state.doc.firstChild?.textContent).toBe('Untitled <draft> & notes');
  });
});
