import { expect, it, vi } from 'vitest';
import { NotebookRepository } from './NotebookRepository';
import type { IStorageProvider } from '../interfaces';

const notebook = {
  id: 'book',
  name: 'Current',
  description: '',
  lastAccessedAt: 100,
  accessCount: 1,
  fileCount: 1,
  totalSize: 100,
  cacheEnabled: true,
};
const file = {
  notebookId: 'book',
  filePath: 'notebook_book.json',
  fileName: 'Current.easynb',
  content: '{"cells":[]}',
  size: 100_000_000,
  lastModified: '2026-09-20',
  remoteUrl: '/remote/book',
};

function setup(
  existing: unknown = { createdAt: 17 },
  files: Array<{ id: string; size: number }> = []
) {
  const readFiles = vi.fn(() => {
    const request = { result: files, onsuccess: undefined as undefined | (() => void) };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  const stores = {
    notebooks: {
      put: vi.fn(),
      get: vi.fn(() => {
        const request = {
          result: existing,
          onsuccess: undefined as undefined | (() => void),
          onerror: undefined,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }),
    },
    activities: { add: vi.fn() },
    files_metadata: { put: vi.fn(), index: vi.fn(() => ({ getAll: readFiles })) },
    files_content: { put: vi.fn(), delete: vi.fn() },
  };
  const storage = {
    transaction: vi.fn(async (_names, _mode, callback) => {
      await callback(stores);
    }),
    get: vi.fn(),
    put: vi.fn(),
  };
  return {
    stores,
    storage,
    repository: new NotebookRepository(storage as unknown as IStorageProvider),
  };
}

it('commits notebook metadata, activity and a forced-local snapshot through one transaction', async () => {
  const { repository, storage, stores } = setup();
  const metadata = await repository.saveNotebookSnapshot(file, notebook);
  expect(storage.transaction).toHaveBeenCalledExactlyOnceWith(
    ['notebooks', 'activities', 'files_metadata', 'files_content'],
    'readwrite',
    expect.any(Function)
  );
  expect(storage.get).not.toHaveBeenCalled();
  expect(storage.put).not.toHaveBeenCalled();
  expect(stores.notebooks.get).toHaveBeenCalledExactlyOnceWith('book');
  expect(stores.notebooks.put).toHaveBeenCalledWith(
    expect.objectContaining({
      ...notebook,
      createdAt: 17,
      fileCount: 1,
      totalSize: file.size,
      lastAccessedAt: expect.any(Number),
    })
  );
  expect(stores.activities.add).toHaveBeenCalledWith(
    expect.objectContaining({ notebookId: 'book', activityType: 'open' })
  );
  expect(metadata).toMatchObject({ hasLocalContent: true, storageType: 'local' });
  expect(stores.files_metadata.put).toHaveBeenCalledExactlyOnceWith(metadata);
  expect(stores.files_content.put).toHaveBeenCalledWith(
    expect.objectContaining({ content: file.content })
  );
  expect(stores.files_content.delete).not.toHaveBeenCalled();
});

it('keeps standalone notebook saves on the same transaction implementation without touching files', async () => {
  const { repository, storage, stores } = setup(null);
  const result = await repository.saveNotebook(notebook);
  expect(result.createdAt).toBe(result.updatedAt);
  expect(storage.transaction).toHaveBeenCalledExactlyOnceWith(
    ['notebooks', 'activities', 'files_metadata'],
    'readwrite',
    expect.any(Function)
  );
  expect(stores.files_content.put).not.toHaveBeenCalled();
  expect(stores.files_metadata.put).not.toHaveBeenCalled();
});

it('rejects mismatched notebook ownership before opening a transaction', async () => {
  const { repository, storage } = setup();
  await expect(
    repository.saveNotebookSnapshot({ ...file, notebookId: 'other' }, notebook)
  ).rejects.toThrow('identity');
  expect(storage.transaction).not.toHaveBeenCalled();
});

it('updates access statistics on the transaction-owned notebook revision', async () => {
  const current = { ...notebook, name: 'New title', accessCount: 9, createdAt: 17, updatedAt: 23 };
  const { repository, storage, stores } = setup(current);
  storage.get.mockResolvedValue({ ...current, name: 'Stale title', accessCount: 1 });
  await repository.updateAccessTime('book');
  expect(storage.get).not.toHaveBeenCalled();
  expect(storage.put).not.toHaveBeenCalled();
  expect(storage.transaction).toHaveBeenCalledExactlyOnceWith(
    ['notebooks'],
    'readwrite',
    expect.any(Function)
  );
  expect(stores.notebooks.put).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'New title',
      accessCount: 10,
      createdAt: 17,
      updatedAt: 23,
    })
  );
});

it('does not resurrect a deleted notebook when updating access statistics', async () => {
  const { repository, storage, stores } = setup(null);
  storage.get.mockResolvedValue({ ...notebook });
  await repository.updateAccessTime('book');
  expect(stores.notebooks.put).not.toHaveBeenCalled();
  expect(storage.put).not.toHaveBeenCalled();
});

it('reads a notebook and publishes its access count with one transaction', async () => {
  const { repository, storage, stores } = setup({ ...notebook, accessCount: 4 });
  const result = await repository.getNotebook('book');
  expect(result).toMatchObject({ name: 'Current', accessCount: 5 });
  expect(stores.notebooks.get).toHaveBeenCalledTimes(1);
  expect(stores.notebooks.put).toHaveBeenCalledExactlyOnceWith(result);
  expect(storage.transaction).toHaveBeenCalledTimes(1);
  expect(storage.get).not.toHaveBeenCalled();
});

it('returns null for an absent notebook without creating access metadata', async () => {
  const { repository, stores } = setup(null);
  expect(await repository.getNotebook('missing')).toBeNull();
  expect(stores.notebooks.put).not.toHaveBeenCalled();
});

it('propagates a content write failure to the transaction owner', async () => {
  const { repository, stores } = setup();
  stores.files_content.put.mockImplementation(() => {
    throw new Error('content write failed');
  });
  await expect(repository.saveNotebookSnapshot(file, notebook)).rejects.toThrow(
    'content write failed'
  );
});

it('does not acknowledge a snapshot before commit and rejects an aborted commit', async () => {
  const { repository, storage, stores } = setup();
  let abort!: () => void;
  const completion = new Promise<void>((resolve) => {
    abort = resolve;
  });
  storage.transaction.mockImplementation(async (_names, _mode, callback) => {
    await callback(stores);
    await completion;
    throw new Error('commit aborted');
  });
  let settled = false;
  const saving = repository.saveNotebookSnapshot(file, notebook);
  const observed = saving.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  abort();
  await expect(saving).rejects.toThrow('commit aborted');
  await observed;
});

it('promotes an evictable cache to persistent when committing a document snapshot', async () => {
  const { repository, stores } = setup({ ...notebook, retention: 'evictable' });
  await repository.saveNotebookSnapshot(file, { ...notebook, retention: 'evictable' });
  expect(stores.notebooks.put).toHaveBeenCalledWith(
    expect.objectContaining({ retention: 'persistent' })
  );
});

it.each(['persistent', undefined])(
  'does not downgrade an existing %s document through metadata refresh',
  async (retention) => {
    const { repository, stores } = setup({ ...notebook, retention });
    await repository.saveNotebook({ ...notebook, retention: 'evictable' });
    expect(stores.notebooks.put).toHaveBeenCalledWith(
      expect.objectContaining({ retention: 'persistent' })
    );
  }
);

it('allows explicit cache ownership only when creating a new cache record', async () => {
  const { repository } = setup(null);
  expect(await repository.saveNotebook({ ...notebook, retention: 'evictable' })).toMatchObject({
    retention: 'evictable',
  });
});

it('counts a replacement snapshot once while retaining other file sizes', async () => {
  const { repository, stores } = setup({ ...notebook, accessCount: 12 }, [
    { id: 'book::notebook_book.json', size: 500 },
    { id: 'book::attachment', size: 20 },
  ]);
  await repository.saveNotebookSnapshot(
    { ...file, size: 30 },
    { ...notebook, fileCount: 999, totalSize: 999 }
  );
  expect(stores.notebooks.put).toHaveBeenCalledWith(
    expect.objectContaining({ fileCount: 2, totalSize: 50, accessCount: 12 })
  );
});

it('metadata refresh derives totals from current files and retains newer access state', async () => {
  const { repository, stores } = setup({ ...notebook, lastAccessedAt: 1000, accessCount: 10 }, [
    { id: 'book::one', size: 7 },
    { id: 'book::two', size: 8 },
  ]);
  await repository.saveNotebook({ ...notebook, fileCount: 999, totalSize: 999 });
  expect(stores.notebooks.put).toHaveBeenCalledWith(
    expect.objectContaining({ fileCount: 2, totalSize: 15, lastAccessedAt: 1000, accessCount: 10 })
  );
  expect(stores.files_metadata.put).not.toHaveBeenCalled();
  expect(stores.files_content.put).not.toHaveBeenCalled();
});

it.each([
  { accessCount: '1', lastAccessedAt: 10 },
  { accessCount: 1, lastAccessedAt: NaN },
  { accessCount: Number.MAX_SAFE_INTEGER, lastAccessedAt: 10 },
])('rejects corrupt or exhausted access histories without a write: %j', async (history) => {
  const { repository, stores } = setup({ ...notebook, ...history });
  await expect(repository.getNotebook('book')).rejects.toThrow();
  expect(stores.notebooks.put).not.toHaveBeenCalled();
});
