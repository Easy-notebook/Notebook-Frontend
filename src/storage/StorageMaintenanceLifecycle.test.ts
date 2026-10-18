import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageMaintenanceLifecycle } from './StorageMaintenanceLifecycle';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const hooks = {
    initialize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    maintain: vi.fn(async () => {}),
    onError: vi.fn(),
  };
  return { hooks, lifecycle: new StorageMaintenanceLifecycle(hooks, 100) };
}

afterEach(() => vi.useRealTimers());

describe('StorageMaintenanceLifecycle', () => {
  it('coalesces initialization and owns exactly one timer across close/reopen', async () => {
    vi.useFakeTimers();
    const { hooks, lifecycle } = fixture();
    await Promise.all([lifecycle.initialize(), lifecycle.initialize()]);
    expect(hooks.initialize).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await lifecycle.close();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hooks.maintain).not.toHaveBeenCalled();
    await lifecycle.initialize();
    expect(hooks.initialize).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await lifecycle.close();
  });

  it('drains initialization without scheduling when close races it', async () => {
    vi.useFakeTimers();
    const { hooks, lifecycle } = fixture();
    const gate = deferred();
    hooks.initialize.mockReturnValueOnce(gate.promise);
    const initializing = lifecycle.initialize();
    await Promise.resolve();
    const closing = lifecycle.close();
    expect(lifecycle.close()).toBe(closing);
    await expect(lifecycle.initialize()).rejects.toThrow('finish closing');
    await expect(lifecycle.run(async () => {})).rejects.toThrow('closed');
    expect(hooks.close).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([initializing, closing]);
    expect(hooks.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for admitted multi-step work before closing the provider', async () => {
    const { hooks, lifecycle } = fixture();
    const gate = deferred();
    const events: string[] = [];
    hooks.close.mockImplementation(async () => {
      events.push('close');
    });
    const work = lifecycle.run(async () => {
      events.push('read');
      await gate.promise;
      events.push('write');
    });
    await Promise.resolve();
    const closing = lifecycle.close();
    expect(events).toEqual(['read']);
    gate.resolve();
    await Promise.all([work, closing]);
    expect(events).toEqual(['read', 'write', 'close']);
    await expect(lifecycle.run(async () => {})).rejects.toThrow('closed');
  });

  it('waits for initialization before running admitted operations', async () => {
    vi.useFakeTimers();
    const { hooks, lifecycle } = fixture();
    const gate = deferred();
    hooks.initialize.mockReturnValueOnce(gate.promise);
    const initializing = lifecycle.initialize();
    const operation = vi.fn(async () => {});
    const work = lifecycle.run(operation);
    await Promise.resolve();
    expect(operation).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([initializing, work]);
    expect(operation).toHaveBeenCalledTimes(1);
    await lifecycle.close();
  });

  it('does not overlap periodic maintenance and drains its asynchronous steps on close', async () => {
    vi.useFakeTimers();
    const { hooks, lifecycle } = fixture();
    const gate = deferred();
    hooks.maintain.mockReturnValueOnce(gate.promise);
    await lifecycle.initialize();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hooks.maintain).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const closing = lifecycle.close();
    expect(hooks.close).not.toHaveBeenCalled();
    gate.resolve();
    await closing;
    await vi.advanceTimersByTimeAsync(1000);
    expect(hooks.maintain).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports failed scheduled work and schedules another attempt', async () => {
    vi.useFakeTimers();
    const { hooks, lifecycle } = fixture();
    const error = new Error('read failed');
    hooks.maintain.mockRejectedValueOnce(error);
    await lifecycle.initialize();
    await vi.advanceTimersByTimeAsync(100);
    expect(hooks.onError).toHaveBeenCalledWith(error);
    await vi.advanceTimersByTimeAsync(100);
    expect(hooks.maintain).toHaveBeenCalledTimes(2);
    await lifecycle.close();
  });

  it('can retry failed initialization without leaving a timer', async () => {
    vi.useFakeTimers();
    const { hooks, lifecycle } = fixture();
    hooks.initialize.mockRejectedValueOnce(new Error('open failed'));
    await expect(lifecycle.initialize()).rejects.toThrow('open failed');
    expect(vi.getTimerCount()).toBe(0);
    await lifecycle.initialize();
    expect(vi.getTimerCount()).toBe(1);
    await lifecycle.close();
  });

  it('drains failed work and failed initialization before closing', async () => {
    const { hooks, lifecycle } = fixture();
    const gate = deferred();
    hooks.initialize.mockReturnValueOnce(gate.promise);
    const initializing = lifecycle.initialize();
    const operation = vi.fn(async () => {});
    const work = lifecycle.run(operation);
    const failure = expect(initializing).rejects.toThrow('failed');
    const workFailure = expect(work).rejects.toThrow('failed');
    const closing = lifecycle.close();
    gate.reject(new Error('failed'));
    await Promise.all([failure, workFailure, closing]);
    expect(operation).not.toHaveBeenCalled();
    expect(hooks.close).toHaveBeenCalledTimes(1);
  });

  it('requires a successful close retry before reopening after close failure', async () => {
    const { hooks, lifecycle } = fixture();
    hooks.close.mockRejectedValueOnce(new Error('close failed'));
    await expect(lifecycle.close()).rejects.toThrow('close failed');
    await expect(lifecycle.initialize()).rejects.toThrow('finish closing');
    await expect(lifecycle.run(async () => {})).rejects.toThrow('closed');
    await lifecycle.close();
    expect(hooks.close).toHaveBeenCalledTimes(2);
  });
});
