import { describe, expect, it, vi } from 'vitest';
import { IndexedDBStorageProvider } from './IndexedDBStorageProvider';

describe('IndexedDB durability acknowledgement', () => {
  it('aborts all scheduled writes when the transaction callback throws synchronously', async () => {
    const transaction = {
      objectStore: () => ({}),
      abort: vi.fn(),
      oncomplete: null,
      onerror: null,
      onabort: null,
    };
    const provider = new IndexedDBStorageProvider();
    Object.assign(provider, { db: { transaction: () => transaction } });
    await expect(
      provider.transaction(['one', 'two'], 'readwrite', () => {
        throw new Error('callback failed');
      })
    ).rejects.toThrow('callback failed');
    expect(transaction.abort).toHaveBeenCalledTimes(1);
  });
  it.each(['put', 'delete'] as const)(
    '%s resolves only after transaction completion',
    async (method) => {
      const request = {};
      const transaction = {
        objectStore: () => ({ put: () => request, delete: () => request }),
        oncomplete: null as null | (() => void),
        onerror: null,
        onabort: null,
      };
      const provider = new IndexedDBStorageProvider();
      Object.assign(provider, { db: { transaction: vi.fn(() => transaction) } });
      let resolved = false;
      const write = provider[method]('store', 'value').then(() => {
        resolved = true;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(resolved).toBe(false);
      transaction.oncomplete!();
      await write;
      expect(resolved).toBe(true);
    }
  );

  it('rejects abort even if the individual request has already succeeded', async () => {
    const transaction = {
      objectStore: () => ({ put: () => ({}) }),
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null as null | (() => void),
    };
    const provider = new IndexedDBStorageProvider();
    Object.assign(provider, { db: { transaction: () => transaction } });
    const write = provider.put('store', 'value');
    const rejected = expect(write).rejects.toThrow('aborted');
    await Promise.resolve();
    transaction.onabort!();
    await rejected;
  });
});
