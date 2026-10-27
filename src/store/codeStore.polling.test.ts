import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ status: vi.fn(), outputs: vi.fn() }));
vi.mock('@Store/notebookStore', async () => {
  const { create } = await import('zustand');
  return {
    default: create(() => ({
      notebookId: 'book' as string | null,
      cells: [{ id: 'cell', type: 'code', content: 'print(1)' }],
      updateCellOutputs: io.outputs,
    })),
  };
});
vi.mock('@Services/notebook/CodeExecutionService', () => ({
  CodeExecutionService: { getExecutionStatus: io.status },
}));
import useCodeStore from './codeStore';
import useNotebookStore from './notebookStore';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const state = () => useCodeStore.getState();
function start() {
  state().setCellExecState('cell', { isExecuting: true, elapsedTime: 0 });
  state().startStatusCheck('cell');
}
beforeEach(() => {
  state().resetAll();
  vi.useFakeTimers();
  vi.resetAllMocks();
  useNotebookStore.setState({
    notebookId: 'book',
    cells: [{ id: 'cell', type: 'code', content: 'print(1)' }],
  });
});
afterEach(() => {
  state().resetAll();
  vi.useRealTimers();
});
it('keeps only one request in flight and polls again after it settles', async () => {
  const slow = deferred<unknown>();
  io.status
    .mockReturnValueOnce(slow.promise)
    .mockResolvedValue({ status: 'running', elapsed_time: 5 });
  start();
  await vi.advanceTimersByTimeAsync(5000);
  expect(io.status).toHaveBeenCalledOnce();
  slow.resolve({ status: 'running', elapsed_time: 4 });
  await vi.advanceTimersByTimeAsync(0);
  expect(state().getCellExecState('cell').elapsedTime).toBe(4);
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.status).toHaveBeenCalledTimes(2);
  expect(state().getCellExecState('cell').elapsedTime).toBe(5);
});
it('stops and aborts an in-flight poll without letting its result publish', async () => {
  const pending = deferred<unknown>();
  io.status.mockReturnValue(pending.promise);
  start();
  await vi.advanceTimersByTimeAsync(1000);
  const signal: AbortSignal = io.status.mock.calls[0][1];
  state().stopStatusCheck('cell');
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  pending.resolve({
    status: 'running',
    elapsed_time: 9,
    outputs: [{ type: 'text', content: 'late' }],
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(io.outputs).not.toHaveBeenCalled();
  expect(state().getCellExecState('cell').statusCheckInterval).toBeNull();
});
it('does not let an old completion stop a restarted polling session', async () => {
  const old = deferred<unknown>();
  io.status
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue({ status: 'running', elapsed_time: 2 });
  start();
  await vi.advanceTimersByTimeAsync(1000);
  state().startStatusCheck('cell');
  const handle = state().getCellExecState('cell').statusCheckInterval;
  old.resolve({ status: 'idle', outputs: [{ type: 'text', content: 'old' }] });
  await vi.advanceTimersByTimeAsync(0);
  expect(state().getCellExecState('cell').statusCheckInterval).toBe(handle);
  expect(io.outputs).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(state().getCellExecState('cell').elapsedTime).toBe(2);
});
it.each(['switch', 'remove', 'reset'] as const)(
  '%s retires timers and suppresses late result publication',
  async (action) => {
    const pending = deferred<unknown>();
    io.status.mockReturnValue(pending.promise);
    start();
    await vi.advanceTimersByTimeAsync(1000);
    if (action === 'switch') {
      useNotebookStore.setState({ notebookId: 'other' });
      useNotebookStore.setState({ notebookId: 'book' });
    } else if (action === 'remove') useNotebookStore.setState({ cells: [] });
    else state().resetAll();
    expect(vi.getTimerCount()).toBe(0);
    expect(io.status.mock.calls[0][1].aborted).toBe(true);
    const before = state().cellExecStates;
    pending.resolve({
      status: 'running',
      elapsed_time: 10,
      outputs: [{ type: 'text', content: 'late' }],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(state().cellExecStates).toBe(before);
    expect(io.outputs).not.toHaveBeenCalled();
  }
);
it('publishes terminal output once and releases the timer', async () => {
  const outputs = [{ type: 'text', content: 'done' }];
  io.status.mockResolvedValue({ status: 'idle', outputs });
  start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.outputs).toHaveBeenCalledExactlyOnceWith('cell', outputs);
  expect(state().getCellExecState('cell')).toMatchObject({
    isExecuting: false,
    elapsedTime: 0,
    statusCheckInterval: null,
  });
  expect(vi.getTimerCount()).toBe(0);
});
it('stops before requesting status when execution is already inactive', async () => {
  start();
  state().setCellExecState('cell', { isExecuting: false });
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.status).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('suppresses a stale rejection without stopping a new polling session', async () => {
  const old = deferred<unknown>();
  io.status.mockReturnValueOnce(old.promise).mockResolvedValue({ status: 'running' });
  start();
  await vi.advanceTimersByTimeAsync(1000);
  state().startStatusCheck('cell');
  old.reject(new Error('old network failure'));
  await vi.advanceTimersByTimeAsync(0);
  expect(state().getCellExecState('cell').isExecuting).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
});
it('retires current polling on a request failure', async () => {
  io.status.mockRejectedValue(new Error('network failure'));
  start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(state().getCellExecState('cell')).toMatchObject({
    isExecuting: false,
    statusCheckInterval: null,
  });
  expect(vi.getTimerCount()).toBe(0);
});
it('honors a synchronous restart triggered by publishing old terminal output', async () => {
  io.status.mockResolvedValue({ status: 'idle', outputs: [{ type: 'text', content: 'done' }] });
  io.outputs.mockImplementation(() => state().startStatusCheck('cell'));
  start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(state().getCellExecState('cell').isExecuting).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
});
