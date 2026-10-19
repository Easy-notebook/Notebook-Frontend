import { expect, it, vi } from 'vitest';
import { FileRepository } from './FileRepository';
import type { IStorageProvider } from '../interfaces';
import { DB_CONFIG } from '../../../storage/database';

function setup(
  metadata: unknown = {
    id: 'book::note.json',
    notebookId: 'book',
    filePath: 'note.json',
    hasLocalContent: true,
    accessCount: 2,
  },
  content?: unknown
) {
  const request = (result: unknown) => {
    const value = { result, onsuccess: undefined as undefined | (() => void), onerror: undefined };
    queueMicrotask(() => value.onsuccess?.());
    return value;
  };
  const metadataStore = {
    get: vi.fn((id?: string) =>
      request(
        id &&
          metadata &&
          typeof metadata === 'object' &&
          !Array.isArray(metadata) &&
          'id' in metadata &&
          metadata.id !== id
          ? undefined
          : metadata
      )
    ),
    put: vi.fn(),
    delete: vi.fn(),
    index: vi.fn(() => ({
      getAll: vi.fn(() =>
        request(
          [
            metadataStore.put.mock.calls[metadataStore.put.mock.calls.length - 1]?.[0] ?? metadata,
          ].filter(Boolean)
        )
      ),
    })),
  };
  const contentStore = {
    get: vi.fn((fileId?: string) =>
      request(
        content === undefined
          ? { fileId, content: 'revision two', compressed: false, encoding: 'utf8' }
          : content
      )
    ),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const stores = {
    [DB_CONFIG.STORES.CONFIG]: { get: vi.fn(() => request(undefined)) },
    [DB_CONFIG.STORES.NOTEBOOKS]: { get: vi.fn(() => request(null)), put: vi.fn() },
    [DB_CONFIG.STORES.ACTIVITIES]: { add: vi.fn() },
    [DB_CONFIG.STORES.FILES_METADATA]: metadataStore,
    [DB_CONFIG.STORES.FILES_CONTENT]: contentStore,
  };
  const transaction = vi.fn(async (_names, _mode, callback) => {
    await callback(stores);
  });
  const storage = { transaction, get: vi.fn(), put: vi.fn() };
  return {
    repository: new FileRepository(storage as unknown as IStorageProvider),
    storage,
    stores,
    metadataStore,
    contentStore,
  };
}

function listSetup() {
  const metadata = [
    { id: 'book::a', notebookId: 'book', filePath: 'a', hasLocalContent: true },
    { id: 'book::b', notebookId: 'book', filePath: 'b', hasLocalContent: false },
    { id: 'book::c', notebookId: 'book', filePath: 'c', hasLocalContent: true },
  ];
  const context = setup(metadata);
  const getAll = vi.fn(() => context.metadataStore.get());
  const index = vi.fn(() => ({ getAll }));
  Object.assign(context.metadataStore, { index });
  const fullScan = vi.fn().mockRejectedValue(new Error('Global metadata scan is forbidden'));
  Object.assign(context.storage, { getAll: fullScan });
  return { ...context, metadata, index, getAll, fullScan };
}

it.each([false, true])(
  'uses the notebook index and one readonly transaction (content: %s)',
  async (includeContent) => {
    const { repository, storage, metadata, index, getAll, fullScan, contentStore } = listSetup();
    const result = await repository.getFilesForNotebook('book', includeContent);
    expect(index).toHaveBeenCalledExactlyOnceWith('notebookId');
    expect(getAll).toHaveBeenCalledExactlyOnceWith('book');
    expect(fullScan).not.toHaveBeenCalled();
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.transaction).toHaveBeenCalledExactlyOnceWith(
      includeContent
        ? [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT]
        : [DB_CONFIG.STORES.FILES_METADATA],
      'readonly',
      expect.any(Function)
    );
    expect(result.map((file) => file.metadata)).toEqual(metadata);
    expect(result.map((file) => file.needsRemoteFetch)).toEqual([false, true, false]);
    expect(contentStore.get.mock.calls).toEqual(includeContent ? [['book::a'], ['book::c']] : []);
    expect(result.map((file) => file.content)).toEqual(
      includeContent
        ? ['revision two', undefined, 'revision two']
        : [undefined, undefined, undefined]
    );
  }
);

it('does not open per-file transactions when listing a large notebook', async () => {
  const context = listSetup();
  context.metadata.splice(
    0,
    context.metadata.length,
    ...Array.from({ length: 1000 }, (_, index) => ({
      id: `book::${index}`,
      notebookId: 'book',
      filePath: String(index),
      hasLocalContent: true,
    }))
  );
  expect(await context.repository.getFilesForNotebook('book', true)).toHaveLength(1000);
  expect(context.storage.transaction).toHaveBeenCalledTimes(1);
  expect(context.contentStore.get).toHaveBeenCalledTimes(1000);
});

it('returns an empty indexed result without issuing content requests', async () => {
  const context = listSetup();
  context.metadata.length = 0;
  expect(await context.repository.getFilesForNotebook('empty', true)).toEqual([]);
  expect(context.contentStore.get).not.toHaveBeenCalled();
});

it('marks absent local content for remote fetch without changing indexed order', async () => {
  const context = listSetup();
  const absent = setup(undefined, null);
  context.contentStore.get.mockImplementationOnce(() => absent.contentStore.get());
  const files = await context.repository.getFilesForNotebook('book', true);
  expect(files.map((file) => file.metadata.id)).toEqual(['book::a', 'book::b', 'book::c']);
  expect(files.map((file) => file.needsRemoteFetch)).toEqual([true, true, false]);
  expect(files[2].content).toBe('revision two');
});

it('reads the file and updates access statistics in a single transaction', async () => {
  const { repository, storage, metadataStore, contentStore } = setup();
  const result = await repository.getFile('book', 'note.json');
  expect(storage.transaction).toHaveBeenCalledExactlyOnceWith(
    [
      DB_CONFIG.STORES.FILES_METADATA,
      DB_CONFIG.STORES.FILES_CONTENT,
      DB_CONFIG.STORES.NOTEBOOKS,
      DB_CONFIG.STORES.ACTIVITIES,
    ],
    'readwrite',
    expect.any(Function)
  );
  expect(storage.get).not.toHaveBeenCalled();
  expect(storage.put).not.toHaveBeenCalled();
  expect(metadataStore.get).toHaveBeenCalledWith('book::note.json');
  expect(contentStore.get).toHaveBeenCalledWith('book::note.json');
  expect(result).toMatchObject({
    metadata: { accessCount: 3 },
    content: 'revision two',
    needsRemoteFetch: false,
  });
  expect(metadataStore.put).toHaveBeenCalledWith(result!.metadata);
});

it.each([false, true])(
  'waits for transaction completion and propagates commit failure: %s',
  async (abort) => {
    const { repository, storage, stores } = setup();
    let commit!: () => void;
    const completed = new Promise<void>((resolve) => {
      commit = resolve;
    });
    storage.transaction.mockImplementation(async (_names, _mode, callback) => {
      await callback(stores);
      await completed;
      if (abort) throw new Error('transaction aborted');
    });
    let settled = false;
    const read = repository.getFile('book', 'note.json');
    const observed = read.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    commit();
    if (abort) await expect(read).rejects.toThrow('transaction aborted');
    else await expect(read).resolves.toMatchObject({ content: 'revision two' });
    await observed;
  }
);

it('does not read content or write access statistics for a missing file', async () => {
  const { repository, metadataStore, contentStore } = setup(null);
  expect(await repository.getFile('book', 'missing')).toBeNull();
  expect(metadataStore.put).not.toHaveBeenCalled();
  expect(contentStore.get).not.toHaveBeenCalled();
});

it('keeps remote and missing local content semantics', async () => {
  const remote = setup({
    id: 'book::remote',
    notebookId: 'book',
    filePath: 'remote',
    hasLocalContent: false,
    accessCount: 0,
  });
  expect(await remote.repository.getFile('book', 'remote')).toMatchObject({
    needsRemoteFetch: true,
  });
  expect(remote.contentStore.get).not.toHaveBeenCalled();
  const missing = setup(
    {
      id: 'book::missing',
      notebookId: 'book',
      filePath: 'missing',
      hasLocalContent: true,
      accessCount: 0,
    },
    null
  );
  expect(await missing.repository.getFile('book', 'missing')).toMatchObject({
    needsRemoteFetch: true,
  });
});

it('rejects a synchronous access-statistics write error rather than hanging the read', async () => {
  const { repository, metadataStore } = setup();
  metadataStore.put.mockImplementation(() => {
    throw new Error('write failed');
  });
  await expect(repository.getFile('book', 'note.json')).rejects.toThrow('write failed');
});

it('updates metadata and content from the same transaction revision', async () => {
  const { repository, storage, metadataStore, contentStore } = setup();
  expect(await repository.updateFileContent('book', 'note.json', '中文')).toBe(true);
  expect(storage.get).not.toHaveBeenCalled();
  expect(storage.transaction).toHaveBeenCalledExactlyOnceWith(
    [
      DB_CONFIG.STORES.FILES_METADATA,
      DB_CONFIG.STORES.FILES_CONTENT,
      DB_CONFIG.STORES.NOTEBOOKS,
      DB_CONFIG.STORES.ACTIVITIES,
    ],
    'readwrite',
    expect.any(Function)
  );
  expect(metadataStore.get).toHaveBeenCalledWith('book::note.json');
  expect(metadataStore.put).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'book::note.json',
      accessCount: 2,
      size: new Blob(['中文']).size,
      hasLocalContent: true,
      storageType: 'local',
    })
  );
  expect(contentStore.put).toHaveBeenCalledExactlyOnceWith({
    fileId: 'book::note.json',
    content: '中文',
    compressed: false,
    encoding: 'utf8',
  });
});

it('does not recreate a file absent when the update transaction reads it', async () => {
  const { repository, storage, metadataStore, contentStore } = setup(null);
  storage.get.mockResolvedValue({ id: 'book::note.json', hasLocalContent: true });
  expect(await repository.updateFileContent('book', 'note.json', 'obsolete')).toBe(false);
  expect(storage.get).not.toHaveBeenCalled();
  expect(metadataStore.put).not.toHaveBeenCalled();
  expect(contentStore.put).not.toHaveBeenCalled();
});

it('propagates update transaction failure after requests succeed', async () => {
  const { repository, storage, stores } = setup();
  storage.transaction.mockImplementation(async (_names, _mode, callback) => {
    await callback(stores);
    throw new Error('commit failed');
  });
  await expect(repository.updateFileContent('book', 'note.json', 'new')).rejects.toThrow(
    'commit failed'
  );
});

it('removes obsolete local content in the transaction that publishes a remote reference', async () => {
  const { repository, storage, contentStore } = setup();
  const metadata = await repository.saveFile(
    {
      notebookId: 'book',
      filePath: 'large.txt',
      fileName: 'large.txt',
      content: 'remote revision',
      size: 100,
      remoteUrl: 'https://example.test/large.txt',
      lastModified: '2026-09-20',
    },
    { maxFileSize: 10 }
  );
  expect(metadata).toMatchObject({ storageType: 'remote', hasLocalContent: false });
  expect(contentStore.delete).toHaveBeenCalledExactlyOnceWith('book::large.txt');
  expect(contentStore.put).not.toHaveBeenCalled();
  expect(storage.transaction).toHaveBeenCalledTimes(1);
});

it.each([undefined, '', '   '])(
  'keeps a large file locally when no remote reference exists: %j',
  async (remoteUrl) => {
    const { repository, contentStore } = setup();
    const metadata = await repository.saveFile(
      {
        notebookId: 'book',
        filePath: 'large.txt',
        fileName: 'large.txt',
        content: 'only copy',
        size: 100,
        remoteUrl,
        lastModified: '2026-09-20',
      },
      { maxFileSize: 10 }
    );
    expect(metadata).toMatchObject({ storageType: 'local', hasLocalContent: true });
    expect(contentStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'only copy' })
    );
    expect(contentStore.delete).not.toHaveBeenCalled();
  }
);

it('honors forced local persistence even when a large file has a remote reference', async () => {
  const { repository, contentStore } = setup();
  const metadata = await repository.saveFile(
    {
      notebookId: 'book',
      filePath: 'snapshot.json',
      fileName: 'snapshot.json',
      content: 'local snapshot',
      size: 100,
      remoteUrl: 'https://example.test/snapshot.json',
      lastModified: '2026-09-20',
    },
    { maxFileSize: 10, forceLocal: true }
  );
  expect(metadata).toMatchObject({ storageType: 'local', hasLocalContent: true });
  expect(contentStore.put).toHaveBeenCalledWith(
    expect.objectContaining({ content: 'local snapshot' })
  );
  expect(contentStore.delete).not.toHaveBeenCalled();
});

it.each([
  false,
  0,
  {},
  { fileId: 'other::file', content: '', compressed: false, encoding: 'utf8' },
  { fileId: 'book::note.json', content: null, compressed: false, encoding: 'utf8' },
])('rejects corrupt content before recording access: %j', async (content) => {
  const { repository, metadataStore, stores } = setup(undefined, content);
  await expect(repository.getFile('book', 'note.json')).rejects.toThrow('Invalid file content');
  expect(metadataStore.put).not.toHaveBeenCalled();
  expect(stores[DB_CONFIG.STORES.ACTIVITIES].add).not.toHaveBeenCalled();
  await expect(repository.getFilesForNotebook('book', true)).rejects.toThrow(
    'Invalid file content'
  );
});

it('returns empty content as a valid cache hit', async () => {
  const { repository } = setup(undefined, {
    fileId: 'book::note.json',
    content: '',
    compressed: false,
    encoding: 'utf8',
  });
  expect(await repository.getFile('book', 'note.json')).toMatchObject({
    content: '',
    needsRemoteFetch: false,
  });
});

it('rejects malformed write content before changing persisted records', async () => {
  const { repository, metadataStore, contentStore } = setup();
  await expect(
    repository.saveFile({
      notebookId: 'book',
      filePath: 'file',
      fileName: 'file',
      content: null as unknown as string,
      size: 0,
      lastModified: 'old',
    })
  ).rejects.toThrow('Invalid file content payload');
  expect(metadataStore.put).not.toHaveBeenCalled();
  expect(contentStore.put).not.toHaveBeenCalled();
});

it.each(['read', 'list', 'large', 'save', 'update', 'delete', 'clear'] as const)(
  'rejects mismatched stored ownership during %s before mutating records',
  async (operation) => {
    const { repository, metadataStore, contentStore } = setup({
      id: 'book::note.json',
      notebookId: 'other',
      filePath: 'note.json',
      hasLocalContent: true,
    });
    const actions = {
      read: () => repository.getFile('book', 'note.json'),
      list: () => repository.getFilesForNotebook('book', true),
      large: () => repository.getLargeFiles('book'),
      save: () =>
        repository.saveFile({
          notebookId: 'book',
          filePath: 'note.json',
          fileName: 'note.json',
          content: 'new',
          size: 3,
          lastModified: 'now',
        }),
      update: () => repository.updateFileContent('book', 'note.json', 'new'),
      delete: () => repository.deleteFile('book', 'note.json'),
      clear: () => repository.clearNotebook('book'),
    };
    await expect(actions[operation]()).rejects.toThrow('Invalid file metadata ownership');
    expect(metadataStore.put).not.toHaveBeenCalled();
    expect(metadataStore.delete).not.toHaveBeenCalled();
    expect(contentStore.put).not.toHaveBeenCalled();
    expect(contentStore.delete).not.toHaveBeenCalled();
  }
);
