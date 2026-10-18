import { describe, expect, it, vi } from 'vitest';
import { IndexedDBStorageProvider } from './IndexedDBStorageProvider';

function fixture() {
  const requests: Array<{
    result: IDBDatabase;
    error: Error | null;
    onsuccess: null | (() => void);
    onerror: null | (() => void);
    onblocked: null | (() => void);
    onupgradeneeded: null | (() => void);
    transaction: { abort: ReturnType<typeof vi.fn> };
  }> = [];
  const reads: Array<{ result: unknown; onsuccess: null | (() => void) }> = [];
  const transactions: Array<{
    oncomplete: null | (() => void);
    onabort: null | (() => void);
    error: Error | null;
    objectStore: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
  }> = [];
  const makeDatabase = () => ({
    close: vi.fn(),
    onclose: null as null | (() => void),
    onversionchange: null as null | (() => void),
    transaction: vi.fn(() => {
      const read = () => {
        const request = { result: undefined as unknown, onsuccess: null as null | (() => void) };
        reads.push(request);
        return request;
      };
      const tx = {
        oncomplete: null as null | (() => void),
        onabort: null as null | (() => void),
        error: null as Error | null,
        objectStore: vi.fn(() => ({ put: vi.fn(), delete: vi.fn(), get: read, getAll: read })),
        abort: vi.fn(() => {
          queueMicrotask(() => tx.onabort?.());
        }),
      };
      transactions.push(tx);
      return tx;
    }),
  });
  const open = vi.fn(() => {
    const request = {
      result: makeDatabase() as unknown as IDBDatabase,
      error: null as Error | null,
      onsuccess: null as null | (() => void),
      onerror: null as null | (() => void),
      onblocked: null as null | (() => void),
      onupgradeneeded: null as null | (() => void),
      transaction: { abort: vi.fn() },
    };
    requests.push(request);
    return request;
  });
  const provider = new IndexedDBStorageProvider({ open } as unknown as IDBFactory);
  const connect = async () => {
    const promise = provider.initialize();
    requests[requests.length - 1].onsuccess!();
    await promise;
  };
  return { provider, open, requests, transactions, reads, connect };
}

describe('IndexedDB connection lifecycle', () => {
  it('shares one opening request across concurrent initializations', async () => {
    const f = fixture();
    const first = f.provider.initialize();
    const second = f.provider.initialize();
    expect(f.open).toHaveBeenCalledTimes(1);
    f.requests[0].onsuccess!();
    await Promise.all([first, second]);
  });

  it('rejects a cancelled open and closes its late result without replacing the new connection', async () => {
    const f = fixture();
    const initial = expect(f.provider.initialize()).rejects.toThrow('closed during initialization');
    await f.provider.close();
    await initial;
    await f.connect();
    f.requests[0].onsuccess!();
    expect(f.requests[0].result.close).toHaveBeenCalledOnce();
    const write = f.provider.put('store', 'value');
    await Promise.resolve();
    expect(f.requests[1].result.transaction).toHaveBeenCalledOnce();
    expect(f.requests[0].result.transaction).not.toHaveBeenCalled();
    f.transactions[0].oncomplete!();
    await write;
  });

  it('does not schedule an upgrade after close invalidates the opening attempt', async () => {
    const f = fixture();
    const initial = expect(f.provider.initialize()).rejects.toThrow('closed');
    await f.provider.close();
    f.requests[0].onupgradeneeded!();
    expect(f.requests[0].transaction.abort).toHaveBeenCalledOnce();
    await initial;
  });

  it.each(['onerror', 'onblocked'] as const)(
    'allows retry after %s and ignores stale callbacks',
    async (event) => {
      const f = fixture();
      const failed = expect(f.provider.initialize()).rejects.toThrow();
      f.requests[0][event]!();
      await failed;
      await f.connect();
      f.requests[0].onerror!();
      await f.provider.initialize();
      expect(f.open).toHaveBeenCalledTimes(2);
    }
  );

  it('allows retry after a synchronous factory exception', async () => {
    const f = fixture();
    f.open.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    await expect(f.provider.initialize()).rejects.toThrow('unavailable');
    await f.connect();
    expect(f.open).toHaveBeenCalledTimes(2);
  });

  it('aborts a failed schema upgrade and permits a fresh initialization', async () => {
    const f = fixture();
    const failed = expect(f.provider.initialize()).rejects.toThrow();
    // This incomplete database cannot create the required schema.
    f.requests[0].onupgradeneeded!();
    await failed;
    expect(f.requests[0].transaction.abort).toHaveBeenCalledOnce();
    await f.connect();
    expect(f.open).toHaveBeenCalledTimes(2);
  });

  it('reopens after an unexpected database close', async () => {
    const f = fixture();
    await f.connect();
    (f.requests[0].result.onclose as unknown as () => void)();
    await f.connect();
    expect(f.open).toHaveBeenCalledTimes(2);
  });

  it('drains accepted transactions while rejecting new work during close', async () => {
    const f = fixture();
    await f.connect();
    const write = f.provider.put('store', 'value');
    await Promise.resolve();
    let closed = false;
    const closing = f.provider.close();
    expect(f.provider.close()).toBe(closing);
    void closing.then(() => {
      closed = true;
    });
    await expect(f.provider.put('store', 'new')).rejects.toThrow('closing');
    expect(closed).toBe(false);
    f.transactions[0].oncomplete!();
    await Promise.all([closing, write]);
    expect(closed).toBe(true);
    expect(f.requests[0].result.close).toHaveBeenCalledOnce();
  });

  it('rejects work awaiting admission when close invalidates its connection', async () => {
    const f = fixture();
    await f.connect();
    const rejected = expect(f.provider.put('store', 'value')).rejects.toThrow('admission');
    await f.provider.close();
    await rejected;
    expect(f.transactions).toHaveLength(0);
  });

  it('releases a connection on version change and ignores its later close event', async () => {
    const f = fixture();
    await f.connect();
    const old = f.requests[0].result;
    (old.onversionchange as unknown as () => void)();
    await f.provider.close();
    await f.connect();
    (old.onclose as unknown as () => void)();
    await f.provider.initialize();
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(old.close).toHaveBeenCalledOnce();
  });
});

describe('IndexedDB transaction acknowledgement', () => {
  it.each(['put', 'delete'] as const)('%s waits for completion', async (method) => {
    const f = fixture();
    await f.connect();
    let resolved = false;
    const write = f.provider[method]('store', 'value').then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    f.transactions[0].oncomplete!();
    await write;
    expect(resolved).toBe(true);
  });

  it.each(['get', 'getAll'] as const)(
    '%s does not report request success before commit',
    async (method) => {
      const f = fixture();
      await f.connect();
      let resolved = false;
      const read = (
        method === 'get' ? f.provider.get('store', 'key') : f.provider.getAll('store')
      ).then((value) => {
        resolved = true;
        return value;
      });
      await Promise.resolve();
      f.reads[0].result = ['saved'];
      f.reads[0].onsuccess!();
      await Promise.resolve();
      expect(resolved).toBe(false);
      f.transactions[0].oncomplete!();
      await expect(read).resolves.toEqual(['saved']);
    }
  );

  it('rejects an aborted read even after request success and allows close to finish', async () => {
    const f = fixture();
    await f.connect();
    const read = expect(f.provider.get('store', 'key')).rejects.toThrow('aborted');
    await Promise.resolve();
    f.reads[0].onsuccess!();
    const close = f.provider.close();
    f.transactions[0].onabort!();
    await Promise.all([read, close]);
  });

  it.each(['sync', 'async'] as const)(
    'aborts all writes after a %s scheduling failure',
    async (kind) => {
      const f = fixture();
      await f.connect();
      const error = new Error('callback failed');
      const operation = f.provider.transaction(['one', 'two'], 'readwrite', (stores) => {
        stores.one.put('first');
        if (kind === 'sync') throw error;
        return Promise.reject(error);
      });
      await expect(operation).rejects.toBe(error);
      expect(f.transactions[0].abort).toHaveBeenCalledOnce();
      await f.provider.close();
    }
  );
});
