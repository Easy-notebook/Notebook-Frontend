import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { getTipTapExtensions } from '../TipTap/config/extensions';
import { tableInputPluginKey, tableInputTransaction } from './TableExtension';

let editor: Editor;
const paragraph = (text: string) => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});
const cell = (id: string, ...texts: string[]) => ({
  type: 'markdownCell',
  attrs: { cellId: id },
  content: texts.map(paragraph),
});
function create(...cells: any[]) {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: {
      type: 'doc',
      content: [{ type: 'title', attrs: { cellId: 'title' } }, ...cells],
    },
  });
}
function selectParagraph(text: string) {
  let position = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent === text && position < 0)
      position = pos + 1 + node.content.size;
  });
  expect(position).toBeGreaterThan(0);
  editor.commands.setTextSelection(position);
  return position;
}
function key(key: string, options: KeyboardEventInit = {}) {
  return editor.view.someProp('handleKeyDown', (handler) =>
    handler(editor.view, new KeyboardEvent('keydown', { key, ...options }))
  );
}
afterEach(() => editor?.destroy());

describe('local table input lifecycle', () => {
  it('converts only adjacent paragraphs in the edited cell of a 1000-cell notebook', () => {
    create(
      cell('edited', '| A | B |', '| --- | ---'),
      ...Array.from({ length: 999 }, (_, index) => cell(`other-${index}`, 'Untouched'))
    );
    const pos = selectParagraph('| --- | ---');
    const original = editor.state.doc;
    const scan = vi.spyOn(original, 'descendants');
    const tr = tableInputTransaction(editor.state, pos, pos, '|');
    expect(scan).not.toHaveBeenCalled();
    scan.mockRestore();
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
    expect(editor.state.doc.child(1).firstChild?.type.name).toBe('table');
    expect(editor.state.doc.child(1).firstChild?.childCount).toBe(2);
    expect(editor.state.doc.lastChild).toBe(original.lastChild);
    editor.commands.undo();
    expect(editor.state.doc.eq(original)).toBe(true);
  });
  it('does not combine paragraphs across cell boundaries', () => {
    create(cell('header', '| A | B |'), cell('separator', '| --- | ---'));
    const pos = selectParagraph('| --- | ---');
    expect(tableInputTransaction(editor.state, pos, pos, '|')).toBeNull();
  });
  it('does not allocate candidate transactions for unrelated text', () => {
    create(cell('body', 'Ordinary paragraph', 'Another paragraph'));
    const pos = selectParagraph('Another paragraph');
    const transaction = vi.spyOn(editor.state, 'tr', 'get');
    expect(tableInputTransaction(editor.state, pos, pos, '-')).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    transaction.mockRestore();
  });
  it('keeps empty columns and escaped pipes when Enter creates a table', () => {
    create(cell('body', '| A\\|B | | C |'));
    selectParagraph('| A\\|B | | C |');
    expect(key('Enter')).toBe(true);
    const table = editor.state.doc.child(1).firstChild!;
    expect(table.type.name).toBe('table');
    expect(table.firstChild?.childCount).toBe(3);
    expect(table.firstChild?.child(0).textContent).toBe('A|B');
    expect(table.firstChild?.child(1).textContent).toBe('');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.node(-1).type.name).toBe('tableCell');
  });
  it('inserts and deletes body rows using table-aware commands', () => {
    create(cell('body', '| A | B |'));
    selectParagraph('| A | B |');
    key('Enter');
    expect(key('Enter', { shiftKey: true })).toBe(true);
    expect(editor.state.doc.child(1).firstChild?.childCount).toBe(3);
    expect(key('Backspace', { shiftKey: true })).toBe(true);
    expect(editor.state.doc.child(1).firstChild?.childCount).toBe(2);
    selectParagraph('A');
    expect(key('Delete', { shiftKey: true })).toBe(true);
    expect(editor.state.doc.child(1).firstChild?.type.name).toBe('paragraph');
  });
  it('does not intercept composition or read-only keyboard/text input', () => {
    create(cell('body', '| A | B |', '| --- | ---'));
    const pos = selectParagraph('| --- | ---');
    const plugin = tableInputPluginKey.get(editor.state)!;
    const handleKey = plugin.props.handleKeyDown!;
    const original = editor.state.doc;
    expect(
      handleKey.call(
        plugin,
        editor.view,
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true })
      )
    ).toBe(false);
    editor.setEditable(false);
    expect(
      handleKey.call(plugin, editor.view, new KeyboardEvent('keydown', { key: 'Enter' }))
    ).toBe(false);
    expect(
      plugin.props.handleTextInput!.call(plugin, editor.view, pos, pos, '|', () => editor.state.tr)
    ).toBe(false);
    expect(editor.state.doc).toBe(original);
  });
  it('uses logical table width when adding a row after a merged body cell', () => {
    create({
      type: 'markdownCell',
      attrs: { cellId: 'merged' },
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: ['A', 'B'].map((text) => ({
                type: 'tableHeader',
                content: [paragraph(text)],
              })),
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 2 }, content: [paragraph('Merged')] },
              ],
            },
          ],
        },
      ],
    });
    selectParagraph('Merged');
    expect(key('Enter', { shiftKey: true })).toBe(true);
    const table = editor.state.doc.child(1).firstChild!;
    expect(table.childCount).toBe(3);
    expect(
      table.lastChild!.content.content.reduce((width, cell) => width + cell.attrs.colspan, 0)
    ).toBe(2);
    expect(editor.state.selection.$from.node(-2)).toBe(table.lastChild);
  });
});
