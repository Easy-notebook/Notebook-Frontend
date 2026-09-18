import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@Store/notebookStore', () => ({
  default: (selector: any) =>
    selector({ cells: [{ id: 'other', type: 'link', content: '[same](file.txt)', outputs: [] }] }),
}));
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: any) => <div>{children}</div>,
  ReactNodeViewRenderer: vi.fn(),
}));
vi.mock('../Cells/LinkCell', () => ({
  default: ({ cell, readOnly }: any) => (
    <div data-testid="link" data-id={cell.id} data-readonly={String(readOnly)} />
  ),
}));
import { FileAttachmentView } from './FileAttachmentExtension';

it('never adopts another attachment identity merely because its text matches', () => {
  const updateAttributes = vi.fn();
  render(
    <FileAttachmentView
      node={{ attrs: { cellId: 'mine', markdown: '[same](file.txt)' } }}
      updateAttributes={updateAttributes}
      deleteNode={vi.fn()}
    />
  );
  expect(screen.getByTestId('link').getAttribute('data-id')).toBe('mine');
  expect(screen.getByTestId('link').getAttribute('data-readonly')).toBe('true');
  expect(updateAttributes).not.toHaveBeenCalled();
});
