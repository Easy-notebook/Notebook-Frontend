import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  initialize: vi.fn(),
  execute: vi.fn(),
  cancel: vi.fn(),
  status: vi.fn(),
  clear: vi.fn(),
  outputs: vi.fn(),
  save: vi.fn(),
  native: vi.fn(),
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
vi.mock('@Services/notebook/NativeCellExecution', () => ({
  NativeCellExecution: class {
    execute = io.native;
  },
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
  io.native.mockResolvedValue({ status: 'ok', outputs: [{ type: 'text', content: 'native' }] });
});
afterEach(() => {
  state().resetAll();
  useCodeStore.setState(initial, true);
  vi.useRealTimers();
});
it('runs AAL without Python initialization, execution or polling and saves the result', async () => {
  useNotebookStore.setState({
    cells: [{ id: 'a', type: 'code', content: 'native source', language: 'aal' }],
  });
  expect(await state().executeCell('a')).toMatchObject({ success: true });
  expect(io.native).toHaveBeenCalledExactlyOnceWith('native source', expect.any(AbortSignal));
  expect(io.initialize).not.toHaveBeenCalled();
  expect(io.execute).not.toHaveBeenCalled();
  expect(io.status).not.toHaveBeenCalled();
  expect(io.outputs).toHaveBeenCalledExactlyOnceWith('a', [{ type: 'text', content: 'native' }]);
  expect(io.save).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not publish AAL results after switching notebooks', async () => {
  const result = deferred<unknown>();
  io.native.mockReturnValue(result.promise);
  useNotebookStore.setState({
    cells: [{ id: 'a', type: 'code', content: 'native source', language: 'aal' }],
  });
  const attempt = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  useNotebookStore.setState({ notebookId: 'other' });
  result.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'stale' }] });
  expect(await attempt).toMatchObject({ success: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(io.outputs).not.toHaveBeenCalled();
  expect(io.save).not.toHaveBeenCalled();
});
it('runs a mixed-language batch in captured order through each explicit backend', async () => {
  useNotebookStore.setState({
    cells: [
      { id: 'a', type: 'code', content: 'native source', language: 'aal' },
      { id: 'b', type: 'code', content: 'python source', language: 'python' },
    ],
  });
  const phases = vi.fn();
  expect(await state().executeCells(['a', 'b'], phases)).toMatchObject({
    success: true,
    completed: ['a', 'b'],
  });
  expect(io.native).toHaveBeenCalledExactlyOnceWith('native source', expect.any(AbortSignal));
  expect(io.execute).toHaveBeenCalledExactlyOnceWith(
    'python source',
    'book',
    expect.any(AbortSignal)
  );
  expect(io.native.mock.invocationCallOrder[0]).toBeLessThan(
    io.execute.mock.invocationCallOrder[0]
  );
  expect(phases.mock.calls).toEqual([['a'], ['b']]);
  expect(io.save).toHaveBeenCalledTimes(2);
});
it('coalesces duplicate batches and rejects individual execution without cancelling', async () => {
  const response = deferred<unknown>();
  io.execute.mockReturnValueOnce(response.promise);
  const first = state().executeCells(['a', 'b']);
  expect(state().executeCells(['a', 'b'])).toBe(first);
  expect(await state().executeCell('a')).toMatchObject({ error: 'batch_execution_active' });
  expect(await state().executeCells(['b'])).toMatchObject({ error: 'batch_execution_active' });
  expect(io.cancel).not.toHaveBeenCalled();
  response.resolve({ status: 'ok' });
  expect(await first).toMatchObject({ success: true, completed: ['a', 'b'] });
  expect(io.execute).toHaveBeenCalledTimes(2);
});
it('rejects a batch while an individual cell is running without clearing or cancelling it', async () => {
  const response = deferred<unknown>();
  io.execute.mockReturnValueOnce(response.promise);
  const single = state().executeCell('a');
  await vi.advanceTimersByTimeAsync(0);
  expect(await state().executeCells(['a', 'b'])).toMatchObject({ error: 'kernel_busy' });
  expect(io.cancel).not.toHaveBeenCalled();
  expect(io.clear.mock.calls).toEqual([['a']]);
  response.resolve({ status: 'ok' });
  expect(await single).toMatchObject({ success: true });
});
it('stops on the first terminal failure and never clears later cell outputs', async () => {
  io.execute.mockResolvedValueOnce({ status: 'error', error: 'E_COMPILE: missing name' });
  expect(await state().executeCells(['a', 'b'])).toMatchObject({
    success: false,
    completed: [],
    failedCellId: 'a',
    error: 'E_COMPILE: missing name',
  });
  expect(io.execute).toHaveBeenCalledTimes(1);
  expect(io.clear.mock.calls).toEqual([['a']]);
  expect(io.save).toHaveBeenCalledOnce();
  expect(await state().executeCell('b')).toMatchObject({ success: true });
});
it('stops between cells while allowing the admitted native cell to finish and save', async () => {
  const response = deferred<unknown>();
  io.native.mockReturnValueOnce(response.promise);
  useNotebookStore.setState({
    cells: [
      { id: 'a', type: 'code', content: 'first native', language: 'aal' },
      { id: 'b', type: 'code', content: 'second native', language: 'aal' },
    ],
  });
  const batch = state().executeCells(['a', 'b']);
  await vi.advanceTimersByTimeAsync(0);
  expect(state().batchExecution).toBe('running');
  state().stopBatchExecution();
  state().stopBatchExecution();
  expect(state().batchExecution).toBe('stopping');
  expect(await state().executeCell('b')).toMatchObject({ error: 'batch_execution_active' });
  expect(io.cancel).not.toHaveBeenCalled();
  expect(io.native.mock.calls[0][1].aborted).toBe(false);
  response.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'first result' }] });
  expect(await batch).toMatchObject({ success: false, completed: ['a'], error: 'batch_stopped' });
  expect(io.native).toHaveBeenCalledOnce();
  expect(io.outputs).toHaveBeenCalledExactlyOnceWith('a', [
    { type: 'text', content: 'first result' },
  ]);
  expect(io.save).toHaveBeenCalledOnce();
  expect(state().batchExecution).toBe('idle');
});
it.each(['edit', 'language', 'delete', 'navigate', 'reset'] as const)(
  '%s settles the batch, discards late output and prevents remaining dispatch',
  async (change) => {
    const response = deferred<unknown>();
    io.execute.mockReturnValueOnce(response.promise);
    const batch = state().executeCells(['a', 'b']);
    await vi.advanceTimersByTimeAsync(0);
    const cells = useNotebookStore.getState().cells;
    if (change === 'edit')
      useNotebookStore.setState({
        cells: cells.map((c) => (c.id === 'b' ? { ...c, content: 'changed' } : c)),
      });
    if (change === 'language')
      useNotebookStore.setState({
        cells: cells.map((c) => (c.id === 'b' ? { ...c, language: 'aal' } : c)),
      });
    if (change === 'delete')
      useNotebookStore.setState({ cells: cells.filter((c) => c.id !== 'b') });
    if (change === 'navigate') {
      useNotebookStore.setState({ notebookId: 'other' });
      useNotebookStore.setState({ notebookId: 'book' });
    }
    if (change === 'reset') state().resetAll();
    expect(await batch).toMatchObject({ success: false, completed: [] });
    response.resolve({ status: 'ok', outputs: [{ type: 'text', content: 'stale' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(io.execute).toHaveBeenCalledTimes(1);
    expect(io.outputs).not.toHaveBeenCalled();
    expect(io.save).not.toHaveBeenCalled();
    expect(state().getCellExecState('a').isExecuting).toBe(false);
  }
);
it('validates the entire batch before any execution or output mutation', async () => {
  useNotebookStore.setState({
    cells: [
      { id: 'a', type: 'code', content: 'native source', language: 'aal' },
      { id: 'b', type: 'code', content: 'unsupported', language: 'javascript' },
    ],
  });
  expect(await state().executeCells(['a', 'b'])).toMatchObject({ success: false, completed: [] });
  expect(await state().executeCells(['a', 'a'])).toMatchObject({ success: false });
  expect(await state().executeCells([])).toMatchObject({ success: false });
  expect(io.native).not.toHaveBeenCalled();
  expect(io.execute).not.toHaveBeenCalled();
  expect(io.clear).not.toHaveBeenCalled();
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
