import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  initialize: vi.fn(),
  execute: vi.fn(),
  cancel: vi.fn(),
  status: vi.fn(),
  clear: vi.fn(),
  outputs: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@Store/notebookStore', async () => {
  const { create } = await import('zustand');
  return {
    default: create(() => ({
      notebookId: 'book' as string | null,
      cells: [
        { id: 'a', type: 'code', content: 'original', language: 'python' },
        { id: 'b', type: 'code', content: 'second', language: 'python' },
      ],
      clearCellOutputs: io.clear,
      updateCellOutputs: io.outputs,
      triggerAutoSave: io.save,
    })),
  };
});
vi.mock('@Services/notebook/CodeExecutionService', () => ({
  CodeExecutionService: {
    executeCode: io.execute,
    cancelExecution: io.cancel,
    getExecutionStatus: io.status,
  },
}));
vi.mock('@Services/notebook/NotebookLifecycleService', () => ({
  NotebookLifecycleService: { restartNotebook: async () => ({ status: 'ok' }) },
}));
import useCodeStore from './codeStore';
import useNotebookStore from './notebookStore';
const initial = useCodeStore.getState();
const state = () => useCodeStore.getState();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  state().resetAll();
  vi.useFakeTimers();
  vi.resetAllMocks();
  useCodeStore.setState({ ...initial, initializeKernel: io.initialize }, true);
  useNotebookStore.setState({
    notebookId: 'book',
    cells: [
      { id: 'a', type: 'code', content: 'original', language: 'python' },
      { id: 'b', type: 'code', content: 'second', language: 'python' },
    ],
  });
  io.initialize.mockResolvedValue('book');
  io.execute.mockResolvedValue({ status: 'ok', outputs: [{ type: 'text', content: 'done' }] });
  io.cancel.mockResolvedValue({ status: 'ok' });
  io.status.mockResolvedValue({ status: 'running' });
});
afterEach(() => {
  state().resetAll();
  useCodeStore.setState(initial, true);
  vi.useRealTimers();
});
it('executes captured user code exactly once without a warmup and saves owned output', async () => {
  const init = deferred<string>();
  io.initialize.mockReturnValue(init.promise);
  const pending = state().executeCell('a');
  useNotebookStore.setState({
    cells: [{ id: 'a', type: 'code', content: 'edited', language: 'python' }],
  });
  init.resolve('book');
  expect(await pending).toMatchObject({ success: true });
  expect(io.execute).toHaveBeenCalledExactlyOnceWith('original', 'book', expect.any(AbortSignal));
  expect(io.outputs).toHaveBeenCalledExactlyOnceWith('a', [{ type: 'text', content: 'done' }]);
  expect(io.save).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['switch', 'remove', 'reset'] as const)(
  '%s discards old execution output and does not save it',
  async (action) => {
    const response = deferred<unknown>();
    io.execute.mockReturnValue(response.promise);
    const pending = state().executeCell('a');
    await vi.advanceTimersByTimeAsync(0);
    if (action === 'switch') {
      useNotebookStore.setState({ notebookId: 'other' });
      useNotebookStore.setState({ notebookId: 'book' });
    } else if (action === 'remove') useNotebookStore.setState({ cells: [] });
    else state().resetAll();
    expect(await pending).toMatchObject({ success: false, error: 'execution_context_changed' });
    expect(io.execute.mock.calls[0][2].aborted).toBe(true);
    response.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'stale' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(io.outputs).not.toHaveBeenCalled();
    expect(io.save).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
);
it('holds kernel admission while initializing and rejects a different cell', async () => {
  const init = deferred<string>();
  io.initialize.mockReturnValue(init.promise);
  const pending = state().executeCell('a');
  expect(await state().executeCell('b')).toMatchObject({ error: 'kernel_busy' });
  expect(io.initialize).toHaveBeenCalledOnce();
  init.resolve('book');
  await pending;
});
it('cancels during initialization without dispatching code afterward', async () => {
  const init = deferred<string>();
  io.initialize.mockReturnValue(init.promise);
  const pending = state().executeCell('a');
  expect(await state().executeCell('a')).toMatchObject({ error: 'canceled_by_user' });
  init.resolve('book');
  expect(await pending).toMatchObject({ success: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(io.execute).not.toHaveBeenCalled();
  expect(io.cancel).not.toHaveBeenCalled();
});
it('deduplicates cancellation and suppresses an execution response arriving during cancellation', async () => {
  const response = deferred<unknown>();
  const cancel = deferred<unknown>();
  io.execute.mockReturnValue(response.promise);
  io.cancel.mockReturnValue(cancel.promise);
  const pending = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  const one = state().cancelCellExecution('a');
  const two = state().cancelCellExecution('a');
  expect(one).toBe(two);
  response.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'discard' }] });
  await vi.advanceTimersByTimeAsync(0);
  expect(io.outputs).not.toHaveBeenCalled();
  expect(await state().executeCell('b')).toMatchObject({ error: 'kernel_busy' });
  cancel.resolve({ status: 'ok' });
  expect(await one).toMatchObject({ error: 'canceled_by_user' });
  await two;
  await pending;
  expect(io.cancel).toHaveBeenCalledOnce();
  expect(io.outputs).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('resumes the owned execution after cancellation is rejected', async () => {
  const response = deferred<unknown>();
  io.execute.mockReturnValue(response.promise);
  io.cancel.mockResolvedValue({ status: 'error', message: 'cannot cancel' });
  const pending = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  expect(await state().cancelCellExecution('a')).toMatchObject({ error: 'cannot cancel' });
  expect(state().getCellExecState('a')).toMatchObject({ isExecuting: true, isCancelling: false });
  response.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'done' }] });
  expect(await pending).toMatchObject({ success: true });
  expect(io.outputs).toHaveBeenCalledOnce();
});
it('keeps execution pending when polling reports idle before the execute response arrives', async () => {
  const response = deferred<unknown>();
  io.execute.mockReturnValue(response.promise);
  io.status.mockResolvedValue({ status: 'idle' });
  const pending = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(1000);
  expect(state().getCellExecState('a').isExecuting).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  response.resolve({ status: 'ok', outputs: [] });
  await pending;
  expect(state().getCellExecState('a').isExecuting).toBe(false);
});
it('does not treat a backend error status with no outputs as successful execution', async () => {
  io.execute.mockResolvedValue({ status: 'error', message: 'execution refused' });
  expect(await state().executeCell('a')).toEqual({ success: false, error: 'execution refused' });
  expect(io.outputs).toHaveBeenCalledWith('a', [{ type: 'error', content: 'execution refused' }]);
  expect(vi.getTimerCount()).toBe(0);
});
it('does not let old completion stop a new execution after a context switch', async () => {
  const old = deferred<unknown>();
  const recent = deferred<unknown>();
  io.execute.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise);
  const first = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  useNotebookStore.setState({ notebookId: 'other' });
  io.initialize.mockResolvedValue('other');
  const next = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  old.reject(new Error('old failure'));
  await first;
  await vi.advanceTimersByTimeAsync(0);
  expect(state().getCellExecState('a').isExecuting).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
  expect(io.outputs).not.toHaveBeenCalled();
  recent.resolve({ status: 'ok', outputs: [] });
  await next;
});

it('settles cancellation promptly on notebook change even when the endpoint ignores abort', async () => {
  const response = deferred<unknown>();
  const cancel = deferred<unknown>();
  io.execute.mockReturnValue(response.promise);
  io.cancel.mockReturnValue(cancel.promise);
  const pending = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  const cancelling = state().cancelCellExecution('a');
  useNotebookStore.setState({ notebookId: 'other' });
  expect(await cancelling).toMatchObject({ error: 'execution_context_changed' });
  await pending;
  cancel.resolve({ status: 'ok' });
  response.resolve({ status: 'ok', outputs: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(io.outputs).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('honors synchronous reset while final outputs are published and skips autosave', async () => {
  io.outputs.mockImplementation(() => state().resetAll());
  expect(await state().executeCell('a')).toMatchObject({ error: 'execution_context_changed' });
  expect(io.save).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('retires the active execution before restarting its kernel', async () => {
  const response = deferred<unknown>();
  io.execute.mockReturnValue(response.promise);
  const pending = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  expect(await state().restartKernel()).toBe(true);
  expect(await pending).toMatchObject({ error: 'execution_context_changed' });
  expect(state().getCellExecState('a').isExecuting).toBe(false);
  response.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'old kernel' }] });
  await vi.advanceTimersByTimeAsync(0);
  expect(io.outputs).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves partial output supplied with a backend execution failure', async () => {
  const outputs = [
    { type: 'text', content: 'before failure' },
    { type: 'error', content: 'traceback' },
  ];
  io.execute.mockResolvedValue({ status: 'error', outputs });
  expect(await state().executeCell('a')).toEqual({ success: false, error: 'traceback' });
  expect(io.outputs).toHaveBeenCalledExactlyOnceWith('a', outputs);
  expect(io.save).toHaveBeenCalledOnce();
});
