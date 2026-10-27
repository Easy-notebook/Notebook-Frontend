import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  run: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@Store/notebookStore', async () => {
  const { create } = await import('zustand');
  return {
    default: create(() => ({
      notebookId: 'book',
      cells: [],
      tasks: [],
      runAllCells: io.run,
      setError: io.error,
    })),
  };
});
vi.mock('sonner', () => ({ toast: { success: io.success, error: io.failure, info: io.info } }));
vi.mock('@Utils/importFile/import4JsonOrJupyterNotebook', () => ({
  default: () => ({ handleImport: vi.fn(), initializeNotebook: vi.fn() }),
}));
vi.mock('@Store/operatorStore', () => ({ default: { getState: () => ({}) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import useStore from '@Store/notebookStore';
import { useNotebookHandlers } from './useNotebookHandlers';
import { BatchExecutionError } from '@Services/notebook/CellExecutionSession';
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ notebookId: 'book' });
});
it('announces success only after Run All completes', async () => {
  io.run.mockResolvedValueOnce(undefined);
  const { result } = renderHook(() => useNotebookHandlers());
  await act(() => result.current.handleRunAll());
  expect(io.success).toHaveBeenCalledExactlyOnceWith('toast.allCellsExecuted');
  expect(io.failure).not.toHaveBeenCalled();
});
it('announces the actual batch failure rather than all cells executed', async () => {
  io.run.mockRejectedValueOnce(new Error('Cell first: E_COMPILE'));
  const { result } = renderHook(() => useNotebookHandlers());
  await act(() => result.current.handleRunAll());
  expect(io.failure).toHaveBeenCalledExactlyOnceWith('Cell first: E_COMPILE');
  expect(io.success).not.toHaveBeenCalled();
});
it('acknowledges an explicit batch stop without presenting success or an execution error', async () => {
  io.run.mockRejectedValueOnce(
    new BatchExecutionError({ success: false, completed: ['first'], error: 'batch_stopped' })
  );
  const { result } = renderHook(() => useNotebookHandlers());
  await act(() => result.current.handleRunAll());
  expect(io.info).toHaveBeenCalledExactlyOnceWith('toast.batchStopped');
  expect(io.success).not.toHaveBeenCalled();
  expect(io.failure).not.toHaveBeenCalled();
  expect(io.error).not.toHaveBeenCalled();
});
it('does not publish an old batch notification after navigating away and back', async () => {
  let reject!: (error: Error) => void;
  io.run.mockImplementationOnce(
    () =>
      new Promise((_, no) => {
        reject = no;
      })
  );
  const { result } = renderHook(() => useNotebookHandlers());
  let running!: Promise<void>;
  act(() => {
    running = result.current.handleRunAll();
  });
  act(() => {
    useStore.setState({ notebookId: 'other' });
    useStore.setState({ notebookId: 'book' });
  });
  await act(async () => {
    reject(new Error('execution_context_changed'));
    await running;
  });
  expect(io.success).not.toHaveBeenCalled();
  expect(io.failure).not.toHaveBeenCalled();
  expect(io.info).not.toHaveBeenCalled();
  expect(io.error).not.toHaveBeenCalled();
});
