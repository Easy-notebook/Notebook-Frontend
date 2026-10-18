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

function setup(existing: unknown = { createdAt: 17 }) {
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
    activities: { put: vi.fn() },
    files_metadata: { put: vi.fn() },
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
    expect.objectContaining({ ...notebook, createdAt: 17 })
  );
  expect(stores.activities.put).toHaveBeenCalledWith(
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
    ['notebooks', 'activities'],
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
