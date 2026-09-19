import { fireEvent, render, screen } from '@testing-library/react';
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
  const node = { type: { name: 'markdownSourceCell' }, attrs: { cellId: 'a', source: 'new', caret: 0 } };
  editor.state.doc.nodeAt.mockReturnValue(node);
  view.rerender(<MarkdownSourceCellView {...({ node, editor, getPos: () => 0, updateAttributes } as unknown as NodeViewProps)} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new edit' } });
  expect(updateAttributes).toHaveBeenCalledWith({ source: 'new edit' });
});
