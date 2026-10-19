import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  notebookId: 'a' as string | null,
  updateCellByUniqueIdentifier: vi.fn(),
}));
const sendOperation = vi.hoisted(() => vi.fn());
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => state } }));
vi.mock('@Store/operatorStore', () => ({ default: { getState: () => ({ sendOperation }) } }));
vi.mock('@Utils/logger', () => ({
  networkLog: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
  agentLog: { info: vi.fn() },
}));
import { videoPollingManager as manager } from './VideoPollingManager';
import { networkLog } from '@Utils/logger';

const options = { taskId: 'task', uniqueIdentifier: 'cell', pollInterval: 10, maxAttempts: 2 };
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function advance(milliseconds: number) {
  await vi.advanceTimersByTimeAsync(milliseconds);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  state.notebookId = 'a';
  sendOperation.mockResolvedValue(undefined);
});
afterEach(() => {
  manager.stopAllPolling();
  vi.useRealTimers();
});

it('serializes slow status requests and times out only after the final response settles', async () => {
  const first = deferred();
  const last = deferred();
  sendOperation.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
  await manager.startPolling(options);
  await advance(100);
  expect(sendOperation).toHaveBeenCalledTimes(1);
  expect(state.updateCellByUniqueIdentifier).not.toHaveBeenCalled();
  first.resolve();
  await advance(10);
  expect(sendOperation).toHaveBeenCalledTimes(2);
  expect(manager.isPolling('task')).toBe(true);
  last.resolve();
  await advance(0);
  expect(state.updateCellByUniqueIdentifier).toHaveBeenCalledExactlyOnceWith('cell', {
    metadata: {
      isGenerating: false,
      generationError: 'Generation timeout',
      generationStatus: 'timeout',
    },
  });
  expect(manager.isPolling('task')).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not overwrite completion received during the final status operation with timeout', async () => {
  sendOperation.mockImplementation(async () => manager.stopPolling('task'));
  await manager.startPolling({ ...options, maxAttempts: 1 });
  await advance(100);
  expect(sendOperation).toHaveBeenCalledTimes(1);
  expect(state.updateCellByUniqueIdentifier).not.toHaveBeenCalled();
  expect(manager.getActivePolls()).toEqual([]);
});

it.each(['resolve', 'reject'] as const)(
  'ignores an obsolete %s after replacing a task',
  async (completion) => {
    const old = deferred();
    sendOperation.mockReturnValueOnce(old.promise);
    await manager.startPolling(options);
    await advance(10);
    await manager.startPolling({ ...options, uniqueIdentifier: 'replacement' });
    if (completion === 'resolve') old.resolve();
    else old.reject(new Error('old request failed'));
    await advance(0);
    expect(manager.getActivePolls()).toEqual(['task']);
    expect(networkLog.error).not.toHaveBeenCalled();
    expect(state.updateCellByUniqueIdentifier).not.toHaveBeenCalled();
    await advance(10);
    expect(sendOperation).toHaveBeenLastCalledWith('a', {
      type: 'check_video_generation_status',
      payload: { taskId: 'task', uniqueIdentifier: 'replacement', commandId: undefined },
    });
  }
);

it('never redirects a pending task to a different notebook', async () => {
  await manager.startPolling(options);
  state.notebookId = 'b';
  await advance(100);
  expect(sendOperation).not.toHaveBeenCalled();
  expect(state.updateCellByUniqueIdentifier).not.toHaveBeenCalled();
  expect(manager.isPolling('task')).toBe(false);
});

it('does not update a new notebook when an old request settles', async () => {
  const request = deferred();
  sendOperation.mockReturnValueOnce(request.promise);
  await manager.startPolling({ ...options, maxAttempts: 1 });
  await advance(10);
  state.notebookId = 'b';
  request.resolve();
  await advance(0);
  expect(state.updateCellByUniqueIdentifier).not.toHaveBeenCalled();
  expect(manager.isPolling('task')).toBe(false);
});

it('catches asynchronous request failures and terminates without further attempts', async () => {
  sendOperation.mockRejectedValue(new Error('offline'));
  await manager.startPolling(options);
  await advance(100);
  expect(sendOperation).toHaveBeenCalledTimes(1);
  expect(networkLog.error).toHaveBeenCalledTimes(1);
  expect(manager.getActivePolls()).toEqual([]);
});

it('stops waiting and in-flight sessions together without allowing stale continuations', async () => {
  const request = deferred();
  sendOperation.mockReturnValueOnce(request.promise);
  await manager.startPolling(options);
  await advance(10);
  await manager.startPolling({ ...options, taskId: 'waiting' });
  manager.stopAllPolling();
  request.resolve();
  await advance(100);
  expect(sendOperation).toHaveBeenCalledTimes(1);
  expect(manager.getActivePolls()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['stop', 'switch'] as const)(
  'checks ownership again after loading the operator module (%s)',
  async (change) => {
    await manager.startPolling(options);
    vi.advanceTimersByTime(10);
    if (change === 'stop') manager.stopPolling('task');
    else state.notebookId = 'b';
    await vi.dynamicImportSettled();
    await advance(100);
    expect(sendOperation).not.toHaveBeenCalled();
    expect(manager.getActivePolls()).toEqual([]);
  }
);

it.each([
  { maxAttempts: 0 },
  { maxAttempts: 1.5 },
  { pollInterval: -1 },
  { pollInterval: Infinity },
])('rejects invalid limits without replacing an accepted task: %j', async (invalid) => {
  await manager.startPolling(options);
  await expect(manager.startPolling({ ...options, ...invalid })).rejects.toThrow(
    'Invalid video polling limits'
  );
  expect(manager.getActivePolls()).toEqual(['task']);
  expect(vi.getTimerCount()).toBe(1);
});
