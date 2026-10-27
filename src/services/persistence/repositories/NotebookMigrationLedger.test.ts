import { expect, it, vi } from 'vitest';
import { NotebookMigrationLedger } from './NotebookMigrationLedger';

function fixture(record?: unknown) {
  const store = {
    get: vi.fn(() => {
      const request = { result: record, onsuccess: undefined as undefined | (() => void) };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }),
    put: vi.fn(),
  };
  return {
    store,
    load: () => NotebookMigrationLedger.load(store as unknown as IDBObjectStore, 'book'),
  };
}

it('completes each source once while admitting independent sources', async () => {
  const f = fixture();
  const ledger = await f.load();
  expect(ledger.allows('one')).toBe(true);
  ledger.complete('one');
  expect(ledger.allows('one')).toBe(false);
  expect(ledger.allows('two')).toBe(true);
  expect(() => ledger.complete('one')).toThrow('terminal');
  ledger.complete('two');
  expect(f.store.put).toHaveBeenLastCalledWith(
    expect.objectContaining({ notebookId: 'book', state: 'imported', sources: ['one', 'two'] })
  );
});

it('deletion is absorbing and retains source history', async () => {
  const f = fixture({ notebookId: 'book', state: 'imported', sources: ['one'], updatedAt: 1 });
  const ledger = await f.load();
  ledger.markDeleted();
  expect(ledger.allows('one')).toBe(false);
  expect(ledger.allows('new')).toBe(false);
  expect(() => ledger.complete('new')).toThrow('terminal');
  ledger.markDeleted();
  expect(f.store.put).toHaveBeenCalledTimes(1);
  expect(f.store.put).toHaveBeenCalledWith(
    expect.objectContaining({ state: 'deleted', sources: ['one'] })
  );
});

it('deletion before any migration prevents all later historical sources', async () => {
  const f = fixture();
  const ledger = await f.load();
  ledger.markDeleted();
  expect(ledger.allows('new')).toBe(false);
  expect(f.store.put).toHaveBeenCalledWith(
    expect.objectContaining({ state: 'deleted', sources: [] })
  );
});

it('a persisted deletion remains terminal after loading again', async () => {
  const f = fixture({ notebookId: 'book', state: 'deleted', sources: [], updatedAt: 1 });
  const ledger = await f.load();
  expect(ledger.allows('new')).toBe(false);
  ledger.markDeleted();
  expect(f.store.put).not.toHaveBeenCalled();
});
