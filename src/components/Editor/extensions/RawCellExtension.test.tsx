import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorReadOnlyContext } from '../EditorAccessContext';

const state = vi.hoisted(() => ({ cells: [] as any[], updateCell: vi.fn() }));
vi.mock('@Store/notebookStore', () => ({ default: (selector: any) => selector(state) }));
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: any) => <div>{children}</div>,
  ReactNodeViewRenderer: vi.fn(),
}));
import { RawCellView } from './RawCellExtension';
afterEach(() => {
  cleanup();
  state.cells = [];
  vi.clearAllMocks();
});

it('retains node content before store hydration', () => {
  const updateAttributes = vi.fn();
  render(
    <RawCellView
      node={{ attrs: { cellId: 'raw', content: 'keep me' } }}
      updateAttributes={updateAttributes}
      deleteNode={vi.fn()}
    />
  );
  expect(screen.getByText('keep me')).toBeDefined();
  expect(updateAttributes).not.toHaveBeenCalled();
});
it('does not reset an active draft when node attributes refresh', () => {
  const updateAttributes = vi.fn();
  const props = { updateAttributes, deleteNode: vi.fn() };
  const view = render(
    <RawCellView {...props} node={{ attrs: { cellId: 'raw', content: 'original' } }} />
  );
  fireEvent.click(screen.getByTitle('Edit'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft' } });
  view.rerender(
    <RawCellView {...props} node={{ attrs: { cellId: 'raw', content: 'external' } }} />
  );
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('draft');
  fireEvent.blur(screen.getByRole('textbox'));
  expect(state.updateCell).toHaveBeenCalledWith('raw', 'draft');
});
it('does not offer editing or deletion in a read-only notebook', () => {
  render(
    <EditorReadOnlyContext.Provider value={true}>
      <RawCellView
        node={{ attrs: { cellId: 'raw', content: 'read me' } }}
        updateAttributes={vi.fn()}
        deleteNode={vi.fn()}
      />
    </EditorReadOnlyContext.Provider>
  );
  fireEvent.doubleClick(screen.getByText('read me'));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});
