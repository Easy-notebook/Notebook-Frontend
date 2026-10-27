import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LegacyDatabaseReader } from './LegacyDatabaseReader';

function fixture(mode: 'probe' | 'files' = 'files') {
  const requests = new Map<string, { result: unknown; onsuccess?: () => void }>();
  const transaction = {
    oncomplete: undefined as undefined | (() => void),
    onabort: undefined as undefined | (() => void),
    error: null as Error | null,
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => {
      const request = {
        result: mode === 'probe' ? 1 : [{ id: name }],
        onsuccess: undefined as undefined | (() => void),
      };
      requests.set(name, request);
      return { count: () => request, getAll: () => request };
    }),
  };
  const database = {
    objectStoreNames: ['metadata', 'files', 'cache_files'],
    transaction: vi.fn(() => transaction),
    close: vi.fn(),
    onversionchange: undefined as undefined | (() => void),
  };
  const open = {
    result: database,
    error: null as Error | null,
    transaction: { abort: vi.fn() },
    onsuccess: undefined as undefined | (() => void),
    onerror: undefined as undefined | (() => void),
    onblocked: undefined as undefined | (() => void),
    onupgradeneeded: undefined as undefined | (() => void),
  };
  const factory = { open: vi.fn(() => open) };
  return {
    reader: new LegacyDatabaseReader('historical', mode, 100, factory as unknown as IDBFactory),
    factory,
    open,
    database,
    transaction,
    requests,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it.each(['probe', 'files'] as const)(
  'waits for %s transaction completion and checks every file store',
  async (mode) => {
    const f = fixture(mode);
    const reading = f.reader.run();
    expect(f.reader.run()).toBe(reading);
    f.open.onsuccess!();
    expect(f.database.transaction).toHaveBeenCalledWith(['files', 'cache_files'], 'readonly');
    for (const request of f.requests.values()) request.onsuccess!();
    let completed = false;
    void reading.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    f.transaction.oncomplete!();
    expect(await reading).toEqual({
      hasFiles: true,
      files: mode === 'files' ? [{ id: 'files' }, { id: 'cache_files' }] : [],
    });
    expect(f.database.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('aborts absent database creation and clears its deadline', async () => {
  const f = fixture();
  const reading = f.reader.run();
  f.open.onupgradeneeded!();
  f.open.onerror!();
  expect(await reading).toEqual({ hasFiles: false, files: [] });
  expect(f.open.transaction.abort).toHaveBeenCalledTimes(1);
  expect(f.database.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('closes a late open after timeout without reading or publishing data', async () => {
  const f = fixture();
  const failed = expect(f.reader.run()).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(100);
  await failed;
  f.open.onsuccess!();
  expect(f.database.close).toHaveBeenCalledTimes(1);
  expect(f.database.transaction).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts active reads on timeout and ignores late result/completion events', async () => {
  const f = fixture();
  const failed = expect(f.reader.run()).rejects.toThrow('timed out');
  f.open.onsuccess!();
  await vi.advanceTimersByTimeAsync(100);
  for (const request of f.requests.values()) request.onsuccess!();
  f.transaction.oncomplete!();
  await failed;
  expect(f.transaction.abort).toHaveBeenCalledTimes(1);
  expect(f.database.close).toHaveBeenCalledTimes(1);
});

it('does not acknowledge successful requests when their transaction aborts', async () => {
  const f = fixture();
  const failed = expect(f.reader.run()).rejects.toThrow('aborted');
  f.open.onsuccess!();
  for (const request of f.requests.values()) request.onsuccess!();
  f.transaction.onabort!();
  await failed;
  expect(f.database.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('terminates a blocked open and closes any eventual connection', async () => {
  const f = fixture();
  const failed = expect(f.reader.run()).rejects.toThrow('blocked');
  f.open.onblocked!();
  await failed;
  f.open.onsuccess!();
  expect(f.database.transaction).not.toHaveBeenCalled();
  expect(f.database.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('releases the connection when a version change interrupts its read', async () => {
  const f = fixture();
  const failed = expect(f.reader.run()).rejects.toThrow('changed version');
  f.open.onsuccess!();
  f.database.onversionchange!();
  await failed;
  expect(f.transaction.abort).toHaveBeenCalledTimes(1);
  expect(f.database.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
