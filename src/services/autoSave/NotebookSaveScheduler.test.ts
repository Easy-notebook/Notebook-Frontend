import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotebookSaveQueue } from './NotebookSaveQueue';
import { NotebookSaveScheduler } from './NotebookSaveScheduler';

function setup(retryDelayMs = 1000, retryable?: (error: unknown) => boolean) {
  const queue = new NotebookSaveQueue();
  const write = vi.fn().mockResolvedValue(undefined);
  const committed = vi.fn();
  const failed = vi.fn();
  const canRun = vi.fn(() => true);
  const scheduler = new NotebookSaveScheduler(queue, {
    maxRetries: 1,
    retryDelayMs,
    retryable,
    write,
    committed,
    failed,
    canRun,
  });
  const enqueue = (id: string) => {
    const snapshot = queue.enqueue({
      notebookId: id,
      notebookTitle: id,
      timestamp: 1,
      cells: [],
      tasks: [],
    });
    scheduler.changed();
    return snapshot;
  };
  return { queue, write, committed, failed, canRun, scheduler, enqueue };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe('scoped single-writer scheduler', () => {
  it('serves a waiting targeted save before another revision of the active notebook', async () => {
    const { scheduler, enqueue, write, committed } = setup();
    const started = deferred();
    const gate = deferred();
    let active = 0;
    let maximumActive = 0;
    write.mockImplementation(async () => {
      maximumActive = Math.max(maximumActive, ++active);
      if (write.mock.calls.length === 1) {
        started.resolve();
        await gate.promise;
      }
      active--;
    });
    let edits = 0;
    committed.mockImplementation((snapshot) => {
      if (snapshot.notebookId === 'a' && edits++ < 3) enqueue('a');
    });
    enqueue('a');
    const a = scheduler.drain('a');
    await started.promise;
    enqueue('b');
    const b = scheduler.drain('b');
    gate.resolve();
    await Promise.all([a, b]);
    expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual([
      'a',
      'b',
      'a',
      'a',
      'a',
    ]);
    expect(maximumActive).toBe(1);
  });

  it('allows a new targeted save during another notebook retry delay', async () => {
    vi.useFakeTimers();
    const { scheduler, enqueue, write } = setup();
    write.mockRejectedValueOnce(new Error('temporary'));
    enqueue('a');
    const a = scheduler.drain('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    enqueue('b');
    await scheduler.drain('b');
    expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(999);
    expect(write).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await a;
    expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual(['a', 'b', 'a']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wakes stale backoff immediately when a newer revision replaces a failed one', async () => {
    vi.useFakeTimers();
    const { scheduler, enqueue, write, queue } = setup();
    write.mockRejectedValueOnce(new Error('old revision failed'));
    const old = enqueue('a');
    const barrier = queue.createBarrier('a', old.revision).completion;
    const drain = scheduler.drain('a');
    await vi.advanceTimersByTimeAsync(0);
    const next = enqueue('a');
    await Promise.all([drain, barrier]);
    expect(write.mock.calls.map(([snapshot]) => snapshot.revision)).toEqual([
      old.revision,
      next.revision,
    ]);
    expect(queue.progress('a')?.committedRevision).toBe(next.revision);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares a retry budget across overlapping requests and isolates failure scopes', async () => {
    vi.useFakeTimers();
    const { scheduler, enqueue, write, queue } = setup();
    write.mockImplementation(async (snapshot) => {
      if (snapshot.notebookId === 'a') throw new Error('quota');
    });
    enqueue('a');
    enqueue('b');
    const all = expect(scheduler.drain()).rejects.toThrow('quota');
    const a = expect(scheduler.drain('a')).rejects.toThrow('quota');
    await scheduler.drain('b');
    expect(queue.progress('b')?.phase).toBe('clean');
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([all, a]);
    expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual(['a', 'b', 'a']);
    expect(queue.progress('a')?.phase).toBe('blocked');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not flush unrelated pending notebooks for a targeted or empty request', async () => {
    const { scheduler, enqueue, write, queue } = setup();
    enqueue('a');
    enqueue('b');
    await scheduler.drain('missing');
    expect(write).not.toHaveBeenCalled();
    await scheduler.drain('b');
    expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual(['b']);
    expect(queue.has('a')).toBe(true);
  });

  it('preserves active request failures for completion observers without starting queued work', async () => {
    const { scheduler, enqueue, write, queue } = setup(0);
    enqueue('a');
    enqueue('b');
    await scheduler.waitForComplete();
    expect(write).not.toHaveBeenCalled();
    write.mockRejectedValue(new Error('quota'));
    const saving = expect(scheduler.drain('a')).rejects.toThrow('quota');
    const observed = expect(scheduler.waitForComplete()).rejects.toThrow('quota');
    await Promise.all([saving, observed]);
    await scheduler.waitForIdle();
    expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual(['a', 'a']);
    expect(queue.has('b')).toBe(true);
  });

  it('releases its timer when the owner discards the waiting notebook', async () => {
    vi.useFakeTimers();
    const { scheduler, enqueue, write, queue } = setup();
    write.mockRejectedValueOnce(new Error('temporary'));
    enqueue('a');
    const saving = scheduler.drain();
    await vi.advanceTimersByTimeAsync(0);
    queue.discard('a');
    scheduler.changed();
    await saving;
    await scheduler.waitForIdle();
    expect(vi.getTimerCount()).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('interrupts retry waiting on teardown without starting another write', async () => {
    vi.useFakeTimers();
    const { scheduler, enqueue, write, canRun, queue } = setup();
    write.mockRejectedValue(new Error('unavailable'));
    enqueue('a');
    const saving = scheduler.drain();
    await vi.advanceTimersByTimeAsync(0);
    canRun.mockReturnValue(false);
    scheduler.changed();
    await Promise.all([saving, scheduler.waitForIdle()]);
    expect(vi.getTimerCount()).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.has('a')).toBe(true);
  });

  it('allows an explicit retry admitted by a terminal failure observer', async () => {
    const { scheduler, enqueue, write, failed, queue } = setup(0);
    write.mockRejectedValueOnce(new Error('quota')).mockRejectedValueOnce(new Error('quota'));
    let retry: Promise<void> | undefined;
    failed.mockImplementation(() => {
      if (queue.progress('a')?.phase === 'blocked') retry = scheduler.drain('a');
    });
    enqueue('a');
    await expect(scheduler.drain('a')).rejects.toThrow('quota');
    expect(retry).toBeDefined();
    await retry;
    expect(write).toHaveBeenCalledTimes(3);
    expect(queue.progress('a')?.phase).toBe('clean');
  });
});

it('blocks nonretryable failures immediately while saving independent notebooks', async () => {
  vi.useFakeTimers();
  const { scheduler, enqueue, write, queue } = setup(60000, () => false);
  write.mockImplementation(async (snapshot) => {
    if (snapshot.notebookId === 'conflict') throw new Error('conflict');
  });
  enqueue('conflict');
  enqueue('safe');
  await expect(scheduler.drain()).rejects.toThrow('conflict');
  expect(write.mock.calls.map(([snapshot]) => snapshot.notebookId)).toEqual(['conflict', 'safe']);
  expect(queue.progress('conflict')).toMatchObject({ phase: 'blocked', committedRevision: 0 });
  expect(queue.has('safe')).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('retains superseding edits but rejects their barriers when the active write hits a terminal conflict', async () => {
  const { scheduler, enqueue, write, queue } = setup(60000, () => false);
  const gate = deferred();
  const started = deferred();
  write.mockImplementationOnce(async () => {
    started.resolve();
    await gate.promise;
    throw new Error('conflict');
  });
  enqueue('book');
  const drain = expect(scheduler.drain('book')).rejects.toThrow('conflict');
  await started.promise;
  const latest = enqueue('book');
  const barrier = expect(queue.createBarrier('book', latest.revision).completion).rejects.toThrow(
    'conflict'
  );
  gate.resolve();
  await Promise.all([drain, barrier]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(queue.get('book')).toBe(latest);
  expect(queue.progress('book')).toMatchObject({
    phase: 'blocked',
    currentRevision: latest.revision,
    committedRevision: 0,
  });
  await scheduler.drain('book');
  expect(write).toHaveBeenCalledTimes(2);
  expect(queue.has('book')).toBe(false);
});
