import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotebookFileCommands } from '@Services/notebook/NotebookFileCommands';
import { FileOperationDialog } from './FileOperationDialog';
vi.mock('antd', () => ({
  Input: ({ autoFocus: _a, status: _s, onPressEnter: _e, ...props }: any) => <input {...props} />,
  Modal: ({ children, title, onOk, onCancel, confirmLoading }: any) => (
    <div>
      <h2>{title}</h2>
      {children}
      <button disabled={confirmLoading} onClick={onOk}>
        确认
      </button>
      <button onClick={onCancel}>取消</button>
    </div>
  ),
  TreeSelect: () => null,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps the dialog and list intact on conflict, and completes only after acknowledged mutation', async () => {
  const create = vi
    .spyOn(NotebookFileCommands.prototype, 'create')
    .mockRejectedValueOnce(new Error('destination already exists'))
    .mockResolvedValueOnce({});
  const close = vi.fn();
  const complete = vi.fn().mockResolvedValue(undefined);
  render(
    <FileOperationDialog
      operation={{ kind: 'file', parent: '/notes' }}
      notebookId="owner"
      revision={3}
      nodes={[]}
      onClose={close}
      onComplete={complete}
    />
  );
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'a.md' } });
  fireEvent.click(screen.getByText('确认'));
  expect(await screen.findByRole('alert')).toHaveTextContent('destination already exists');
  expect(complete).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'b.md' } });
  fireEvent.click(screen.getByText('确认'));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(create).toHaveBeenLastCalledWith('/notes/b.md', false);
  expect(complete).toHaveBeenCalledWith(undefined, '/notes/b.md');
});
it('retains the observed catalog revision if polling changes the tree while naming', async () => {
  const move = vi.spyOn(NotebookFileCommands.prototype, 'move').mockResolvedValue({});
  const props = {
    operation: {
      kind: 'rename' as const,
      file: { name: 'a.md', type: 'file' as const, path: '/a.md' },
    },
    notebookId: 'owner',
    nodes: [],
    onClose: vi.fn(),
    onComplete: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(<FileOperationDialog {...props} revision={3} />);
  view.rerender(<FileOperationDialog {...props} revision={4} />);
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'b.md' } });
  fireEvent.click(screen.getByText('确认'));
  await waitFor(() => expect(move).toHaveBeenCalledWith('/a.md', '/b.md', 3));
});
