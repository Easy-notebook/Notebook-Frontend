import { act, fireEvent, render, screen } from '@testing-library/react';
import type { NodeViewProps } from '@tiptap/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('../TipTap/model/sourceCellTransitions', () => ({ previewMarkdownSource: mocks.preview }));
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactNodeViewRenderer: vi.fn(),
}));
import { MarkdownSourceCellView } from './MarkdownSourceCellExtension';

function setup() {
  mocks.preview.mockClear();
  const node = {
    type: { name: 'markdownSourceCell' },
    attrs: { cellId: 'a', source: 'old', caret: 0 },
  };
  const editor = {
    isDestroyed: false,
    isEditable: true,
    commands: { undo: vi.fn(), redo: vi.fn() },
    view: { hasFocus: vi.fn(() => true) },
    state: { selection: { from: -1 }, doc: { nodeAt: vi.fn(() => node) } },
  };
  const updateAttributes = vi.fn();
  const view = render(
    <MarkdownSourceCellView
      {...({ node, editor, getPos: () => 0, updateAttributes } as unknown as NodeViewProps)}
    />
  );
  return {
    view,
    editor,
    updateAttributes,
    input: screen.getByRole('textbox'),
    preview: screen.getByRole('button', { name: 'Preview' }),
  };
}

it.each(['historyUndo', 'historyRedo'])(
  'routes native %s through document history',
  (inputType) => {
    const { input, editor } = setup();
    const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(true);
    expect(
      inputType === 'historyUndo' ? editor.commands.undo : editor.commands.redo
    ).toHaveBeenCalledOnce();
  }
);

it.each(['composition', 'readonly', 'destroyed', 'uncancelable'])(
  'leaves native history untouched during %s',
  (reason) => {
    const { input, editor } = setup();
    if (reason === 'composition') fireEvent.compositionStart(input);
    if (reason === 'readonly') editor.isEditable = false;
    if (reason === 'destroyed') editor.isDestroyed = true;
    const event = new InputEvent('beforeinput', {
      inputType: 'historyUndo',
      bubbles: true,
      cancelable: reason !== 'uncancelable',
    });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
    expect(editor.commands.undo).not.toHaveBeenCalled();
  }
);

it.each(['destroyed', 'revised', 'unmounted'])(
  'does not run queued source focus after ownership is %s',
  async (reason) => {
    const { editor, input, view } = setup();
    editor.state.selection.from = 0;
    const focus = vi.spyOn(input, 'focus');
    if (reason === 'destroyed') editor.isDestroyed = true;
    if (reason === 'revised')
      editor.state.doc.nodeAt.mockReturnValue({
        type: { name: 'markdownSourceCell' },
        attrs: { cellId: 'a', source: 'new revision', caret: 0 },
      });
    if (reason === 'unmounted') view.unmount();
    await act(async () => {});
    expect(focus).not.toHaveBeenCalled();
  }
);

it('focuses the current source node after the selection transaction settles', async () => {
  const { editor, input } = setup();
  editor.state.selection.from = 0;
  await act(async () => {});
  expect(document.activeElement).toBe(input);
  expect((input as HTMLTextAreaElement).selectionStart).toBe(0);
});

it('keeps composing source mounted until composition ends', () => {
  const { input, preview, updateAttributes } = setup();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '中文' } });
  expect(updateAttributes).toHaveBeenCalledWith({ source: '中文' });
  fireEvent.click(preview);
  expect(mocks.preview).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.click(preview);
  expect(mocks.preview).toHaveBeenCalledOnce();
});

it('ignores undo during a composition even when the key event lacks its composing flag', () => {
  const { input, editor } = setup();
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(editor.commands.undo).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(editor.commands.undo).toHaveBeenCalledOnce();
});

it.each(['replaced', 'revised', 'destroyed', 'readonly'])(
  'ignores source callbacks after ownership is %s',
  (reason) => {
    const { editor, input, preview, updateAttributes } = setup();
    if (reason === 'destroyed') editor.isDestroyed = true;
    else if (reason === 'readonly') editor.isEditable = false;
    else
      editor.state.doc.nodeAt.mockReturnValue({
        type: { name: 'markdownSourceCell' },
        attrs: { cellId: reason === 'revised' ? 'a' : 'b', source: 'other', caret: 0 },
      });
    fireEvent.change(input, { target: { value: 'stale' } });
    fireEvent.click(preview);
    expect(updateAttributes).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  }
);

it('accepts edits again after rendering the latest revision of the same cell', () => {
  const { view, editor, updateAttributes } = setup();
  const node = {
    type: { name: 'markdownSourceCell' },
    attrs: { cellId: 'a', source: 'new', caret: 0 },
  };
  editor.state.doc.nodeAt.mockReturnValue(node);
  view.rerender(
    <MarkdownSourceCellView
      {...({ node, editor, getPos: () => 0, updateAttributes } as unknown as NodeViewProps)}
    />
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new edit' } });
  expect(updateAttributes).toHaveBeenCalledWith({ source: 'new edit' });
});
