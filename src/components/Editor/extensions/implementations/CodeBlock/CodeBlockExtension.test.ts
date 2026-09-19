import { afterEach, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { getTipTapExtensions } from '../../../TipTap/config/extensions';
import { commitFenceInput } from '../../../TipTap/model/fenceInput';

let editor: Editor;
afterEach(() => editor?.destroy());

function input(prefix: string, inserted: string, block = 'paragraph', suffix = '') {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: { type: 'doc', content: [
      { type: 'title', content: [{ type: 'text', text: 'Title' }] },
      { type: block, ...(prefix + suffix ? { content: [{ type: 'text', text: prefix + suffix }] } : {}) },
    ] },
  });
  const pos = editor.state.doc.firstChild!.nodeSize + 1 + prefix.length;
  editor.commands.setTextSelection(pos);
  return editor.view.someProp('handleTextInput', handler =>
    handler(editor.view, pos, pos, inserted, () => editor.state.tr));
}

it('does not replace prose preceding a fence-like input', () => {
  expect(input('Keep this ``', '`python ')).not.toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe('Keep this ``');
  expect(editor.state.doc.child(1).type.name).toBe('paragraph');
});

it('does not discard text after the caret when typing a fence at paragraph start', () => {
  expect(input('``', '`python ', 'paragraph', ' keep this')).not.toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe('`` keep this');
});

it.each(['python', 'js', 'typescript', 'bash', ''])(
  'converts a whole-paragraph %s fence and supports input-rule undo', language => {
    expect(input('', '```' + language + ' ')).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('executableCodeBlock');
    expect(editor.state.doc.child(1).attrs.language).toBe(language === 'js' ? 'javascript' : language || 'python');
    expect(editor.commands.undoInputRule()).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).textContent).toBe('```' + language + ' ');
  }
);

it.each(['```', '```m', '```mermaid', '```typescript'])('keeps unfinished language input literal: %s', text => {
  expect(input('', text)).not.toBe(true);
  expect(editor.state.doc.child(1).type.name).toBe('paragraph');
});

it('commits Mermaid on space without creating executable Python', () => {
  expect(input('', '```mermaid ')).toBe(true);
  expect(editor.state.doc.child(1).type.name).toBe('mermaidBlock');
});

it('accepts Mermaid character by character before the confirming space', () => {
  input('', '');
  for (const character of '```mermaid') {
    const pos = editor.state.selection.from;
    const handled = editor.view.someProp('handleTextInput', handler =>
      handler(editor.view, pos, pos, character, () => editor.state.tr));
    expect(handled).not.toBe(true);
    editor.view.dispatch(editor.state.tr.insertText(character));
  }
  expect(editor.state.doc.child(1).textContent).toBe('```mermaid');
  const pos = editor.state.selection.from;
  expect(editor.view.someProp('handleTextInput', handler =>
    handler(editor.view, pos, pos, ' ', () => editor.state.tr))).toBe(true);
  expect(editor.state.doc.child(1).type.name).toBe('mermaidBlock');
});

it.each(['python', 'mermaid', 'rust', 'c++'])('commits the full %s language on Enter', language => {
  input('```' + language, '');
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  expect(editor.view.someProp('handleKeyDown', handler => handler(editor.view, event))).toBe(true);
  const node = editor.state.doc.child(1);
  expect(node.type.name).toBe(language === 'mermaid' ? 'mermaidBlock' : 'executableCodeBlock');
  if (language !== 'mermaid') expect(node.attrs.language).toBe(language);
  expect(editor.commands.undo()).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe('```' + language);
});

it('does not replace a heading merely because its text resembles a fence', () => {
  expect(input('', '```python ', 'heading')).not.toBe(true);
  expect(editor.state.doc.child(1).type.name).toBe('heading');
});

it('does not convert confirmed fence input after the editor becomes read-only', () => {
  input('', '');
  editor.setEditable(false);
  const before = editor.state.doc;
  const pos = editor.state.selection.from;
  expect(editor.view.someProp('handleTextInput', handler =>
    handler(editor.view, pos, pos, '```python ', () => editor.state.tr))).not.toBe(true);
  expect(editor.state.doc).toBe(before);
});

it.each([false, true])('preserves Markdown cell identity and siblings (has sibling: %s)', sibling => {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: { type: 'doc', content: [
      { type: 'title', content: [{ type: 'text', text: 'Title' }] },
      { type: 'markdownCell', attrs: { cellId: 'existing-cell' }, content: [
        ...(sibling ? [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }] : []),
        { type: 'paragraph', content: [{ type: 'text', text: '```typescript' }] },
      ] },
    ] },
  });
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent.startsWith('```'))
      editor.commands.setTextSelection(pos + 1 + node.content.size);
  });
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  expect(editor.view.someProp('handleKeyDown', handler => handler(editor.view, event))).toBe(true);
  const cell = editor.state.doc.child(1);
  expect(cell.attrs.cellId).toBe('existing-cell');
  if (sibling) {
    expect(cell.type.name).toBe('markdownCell');
    expect(cell.firstChild!.textContent).toBe('Keep me');
    expect(cell.lastChild!.type.name).toBe('fencedCodeBlock');
  } else expect(cell.type.name).toBe('executableCodeBlock');
});

it.each(['python', 'mermaid'])('keeps the cursor on a new %s block inside a list item', language => {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: { type: 'doc', content: [
      { type: 'title', content: [{ type: 'text', text: 'Title' }] },
      { type: 'markdownCell', attrs: { cellId: 'list-cell' }, content: [
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '```' + language }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sibling' }] }] },
        ] },
      ] },
    ] },
  });
  let from = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent.startsWith('```')) from = pos + 1;
  });
  expect(editor.commands.command(({ state }) =>
    commitFenceInput(state, from, from + 3 + language.length, '```' + language))).toBe(true);
  const cell = editor.state.doc.child(1);
  expect(cell.attrs.cellId).toBe('list-cell');
  expect(cell.firstChild!.lastChild!.textContent).toBe('Sibling');
  expect(() => editor.state.doc.check()).not.toThrow();
  const selected = language === 'mermaid'
    ? editor.state.doc.nodeAt(editor.state.selection.from)
    : editor.state.selection.$from.parent;
  expect(selected?.type.name).toBe(language === 'mermaid' ? 'mermaidBlock' : 'fencedCodeBlock');
  expect(editor.commands.undo()).toBe(true);
  expect(editor.state.doc.child(1).firstChild!.firstChild!.textContent).toBe('```' + language);
});

it.each(['blockquote', 'table'])('keeps a fence inside its %s container', container => {
  const paragraph = { type: 'paragraph', content: [{ type: 'text', text: '```python' }] };
  const wrapped = container === 'blockquote'
    ? { type: 'blockquote', content: [paragraph] }
    : { type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [paragraph] },
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sibling' }] }] },
    ] }] };
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: { type: 'doc', content: [
      { type: 'title', content: [{ type: 'text', text: 'Title' }] },
      { type: 'markdownCell', attrs: { cellId: 'container-cell' }, content: [wrapped] },
    ] },
  });
  let from = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent === '```python') from = pos + 1;
  });
  expect(editor.commands.command(({ state }) =>
    commitFenceInput(state, from, from + 9, '```python'))).toBe(true);
  expect(editor.state.selection.$from.parent.type.name).toBe('fencedCodeBlock');
  const cell = editor.state.doc.child(1);
  expect(cell.attrs.cellId).toBe('container-cell');
  expect(cell.firstChild!.type.name).toBe(container);
  if (container === 'table') expect(cell.firstChild!.firstChild!.lastChild!.textContent).toBe('Sibling');
  expect(() => editor.state.doc.check()).not.toThrow();
});
