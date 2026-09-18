import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FencedCodeBlockExtension } from './FencedCodeBlockExtension';
import { MarkdownCellExtension } from './MarkdownCellExtension';

let editor: Editor;
function key(key: string, ctrlKey = false) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));
}
afterEach(() => editor?.destroy());
function create(editable = true) {
  editor = new Editor({
    editable,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      MarkdownCellExtension,
      FencedCodeBlockExtension,
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'markdownCell',
          attrs: { cellId: 'body' },
          content: [
            {
              type: 'fencedCodeBlock',
              attrs: { language: 'python' },
              content: [{ type: 'text', text: 'print(1)' }],
            },
          ],
        },
      ],
    },
  });
  editor.commands.setTextSelection(6);
}

describe('nested code keyboard editing', () => {
  it('inserts a literal newline without splitting the cell or code block', () => {
    create();
    expect(key('Enter')).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.firstChild?.textContent).toBe('prin\nt(1)');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('print(1)');
  });
  it('exits to a paragraph inside the same cell with Mod-Enter', () => {
    create();
    key('Enter', true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.child(1).type.name).toBe('paragraph');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });
  it('does not insert code through the shortcut in read-only mode', () => {
    create(false);
    const before = editor.state.doc.toJSON();
    key('Enter');
    expect(editor.state.doc.toJSON()).toEqual(before);
  });
});
