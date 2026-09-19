import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { getTipTapExtensions } from '../config/extensions';
import { CellSourceButton } from './CellSourceButton';

let editor: Editor;
afterEach(() => {
  cleanup();
  editor?.destroy();
});

it('tracks eligibility, enters source, and releases event subscriptions', () => {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: {
      type: 'doc',
      content: [
        { type: 'title', attrs: { cellId: 'title' }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'markdownCell',
          attrs: { cellId: 'md' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }],
        },
      ],
    },
  });
  const view = render(<CellSourceButton editor={editor} />);
  const button = screen.getByRole('button', { name: 'Cell source' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  const pos = editor.state.doc.firstChild!.nodeSize;
  act(() => {
    editor.commands.setTextSelection(pos + 2);
  });
  expect(button.disabled).toBe(false);
  act(() => editor.setEditable(false));
  expect(button.disabled).toBe(true);
  act(() => editor.setEditable(true));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(editor.state.doc.nodeAt(pos)!.type.name).toBe('markdownSourceCell');
  expect(button.disabled).toBe(true);
  const off = vi.spyOn(editor, 'off');
  view.unmount();
  expect(off).toHaveBeenCalledWith('transaction', expect.any(Function));
  expect(off).toHaveBeenCalledWith('update', expect.any(Function));
});
