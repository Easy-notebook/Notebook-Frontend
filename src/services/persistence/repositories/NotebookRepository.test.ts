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
  existing: unknown = { ...notebook, createdAt: 17 },
  files: Array<{ id: string; notebookId: string; filePath: string; size: number }> = []
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
    {
      id: 'book::notebook_book.json',
      notebookId: 'book',
      filePath: 'notebook_book.json',
      size: 500,
    },
    { id: 'book::attachment', notebookId: 'book', filePath: 'attachment', size: 20 },
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
    { id: 'book::one', notebookId: 'book', filePath: 'one', size: 7 },
    { id: 'book::two', notebookId: 'book', filePath: 'two', size: 8 },
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

it.each(['input', 'stored'])(
  'rejects corrupt %s access history before saving a snapshot',
  async (source) => {
    const invalid = { ...notebook, accessCount: NaN };
    const { repository, stores } = setup(source === 'stored' ? invalid : notebook);
    await expect(
      repository.saveNotebookSnapshot(file, source === 'input' ? invalid : notebook)
    ).rejects.toThrow('Invalid storage access history');
    expect(stores.notebooks.put).not.toHaveBeenCalled();
    expect(stores.files_metadata.put).not.toHaveBeenCalled();
    expect(stores.files_content.put).not.toHaveBeenCalled();
    expect(stores.activities.add).not.toHaveBeenCalled();
  }
);

it.each(['metadata', 'snapshot', 'recalculate'])(
  'rejects corrupt file ownership during %s',
  async (operation) => {
    const { repository, stores } = setup(notebook, [
      {
        id: 'book::notebook_book.json',
        notebookId: 'book',
        filePath: 'wrong',
        size: 3,
      },
    ]);
    const actions = {
      metadata: () => repository.saveNotebook(notebook),
      snapshot: () => repository.saveNotebookSnapshot(file, notebook),
      recalculate: () => repository.recalcNotebookStats('book'),
    };
    await expect(actions[operation as keyof typeof actions]()).rejects.toThrow(
      'Invalid file metadata ownership'
    );
    expect(stores.notebooks.put).not.toHaveBeenCalled();
    expect(stores.files_metadata.put).not.toHaveBeenCalled();
    expect(stores.files_content.put).not.toHaveBeenCalled();
  }
);

it('captures list ordering and pagination before awaiting the database', async () => {
  let complete!: (records: unknown[]) => void;
  const pending = new Promise<unknown[]>((resolve) => {
    complete = resolve;
  });
  const getAll = vi.fn(() => pending);
  const repository = new NotebookRepository({ getAll } as unknown as IStorageProvider);
  const options = { orderBy: 'lastAccessedAt', offset: 1, limit: 1 };
  const query = repository.getAllNotebooks(options);
  options.orderBy = 'fileCount';
  options.offset = 0;
  options.limit = 3;
  const records = [
    { ...notebook, id: 'old', lastAccessedAt: 10, fileCount: 50 },
    { ...notebook, id: 'recent', lastAccessedAt: 30, fileCount: 1 },
    { ...notebook, id: 'middle', lastAccessedAt: 20, fileCount: 10 },
  ];
  complete(records);
  expect((await query).map((record) => record.id)).toEqual(['middle']);
  expect(records.map((record) => record.id)).toEqual(['old', 'recent', 'middle']);
});

it('preserves default ordering, stable ties and zero-limit behavior without mutating provider arrays', async () => {
  const records = [
    { ...notebook, id: 'old', lastAccessedAt: 10 },
    { ...notebook, id: 'first', lastAccessedAt: 20 },
    { ...notebook, id: 'second', lastAccessedAt: 20 },
  ];
  const repository = new NotebookRepository({
    getAll: vi.fn().mockResolvedValue(records),
  } as unknown as IStorageProvider);
  expect((await repository.getAllNotebooks({ limit: 0 })).map((record) => record.id)).toEqual([
    'first',
    'second',
    'old',
  ]);
  expect(records.map((record) => record.id)).toEqual(['old', 'first', 'second']);
});

it('updates library preferences atomically without recording a notebook visit', async () => {
  const { repository, stores } = setup({ ...notebook, library: { icon: '🔬' } });
  await repository.updateLibraryMetadata('book', { isStarred: true });
  expect(stores.notebooks.put).toHaveBeenCalledWith({
    ...notebook,
    library: { icon: '🔬', isStarred: true },
  });
  expect(stores.activities.add).not.toHaveBeenCalled();
});
it('keeps library preferences when an autosave snapshot supplies stale metadata', async () => {
  const { repository, stores } = setup({ ...notebook, library: { icon: '🔬', isStarred: true } });
  await repository.saveNotebookSnapshot(file, notebook);
  expect(stores.notebooks.put).toHaveBeenCalledWith(
    expect.objectContaining({ library: { icon: '🔬', isStarred: true } })
  );
});
