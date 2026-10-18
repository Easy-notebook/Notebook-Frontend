import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function openFixture(page, baseURL) {
  await page.goto(`${baseURL}/tests/browser/storage.html`);
  await page.waitForFunction(() => Boolean(window.storageHarness));
}

test.beforeEach(async ({ page, baseURL }) => {
  await openFixture(page, baseURL);
});

test('committed data survives page reload and a new provider', async ({ page }) => {
  await page.evaluate(async () => {
    const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    await provider.put(DB_CONFIG.STORES.CONFIG, { id: 'committed', value: 'saved' });
    await provider.close();
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.storageHarness));
  expect(
    await page.evaluate(async () => {
      const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      const result = await provider.get(DB_CONFIG.STORES.CONFIG, 'committed');
      await provider.close();
      return result;
    })
  ).toEqual({ id: 'committed', value: 'saved' });
});

test('a native constraint error rolls back writes across both stores', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const config = DB_CONFIG.STORES.CONFIG;
    const content = DB_CONFIG.STORES.FILES_CONTENT;
    await provider.put(config, { id: 'existing', value: 'original' });
    let errorName;
    try {
      await provider.transaction([config, content], 'readwrite', async (stores) => {
        stores[content].put({ fileId: 'uncommitted', content: 'must roll back' });
        stores[config].add({ id: 'existing', value: 'duplicate' });
      });
    } catch (error) {
      errorName = error.name;
    }
    const existing = await provider.get(config, 'existing');
    const uncommitted = await provider.get(content, 'uncommitted');
    await provider.close();
    return { errorName, existing, uncommitted };
  });
  expect(result).toEqual({
    errorName: 'ConstraintError',
    existing: { id: 'existing', value: 'original' },
    uncommitted: undefined,
  });
});

test('close drains an admitted native transaction and rejects new admission', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const store = DB_CONFIG.STORES.CONFIG;
    let closing;
    let denied;
    await provider.transaction([store], 'readwrite', async (stores) => {
      for (let i = 0; i < 100; i++) stores[store].put({ id: String(i), value: i });
      closing = provider.close();
      denied = provider.put(store, { id: 'late' }).catch((error) => error.message);
    });
    await closing;
    const error = await denied;
    const last = await provider.get(store, '99');
    const late = await provider.get(store, 'late');
    await provider.close();
    return { error, last, late };
  });
  expect(result.error).toContain('closing');
  expect(result.last).toEqual({ id: '99', value: 99 });
  expect(result.late).toBeUndefined();
});

test('a blocked native upgrade rejects and can retry after the blocker closes', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBConnection } = window.storageHarness;
    const blocker = await new Promise((resolve, reject) => {
      const open = indexedDB.open('blocked-upgrade', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const connection = new IndexedDBConnection('blocked-upgrade', 2, (db) =>
      db.createObjectStore('values')
    );
    let blocked;
    try {
      await connection.initialize();
    } catch (error) {
      blocked = error.message;
    }
    blocker.close();
    await connection.initialize();
    await connection.runTransaction(['values'], 'readwrite', (tx) => {
      tx.objectStore('values').put('ok', 'key');
    });
    const value = await connection.runTransaction(['values'], 'readonly', (tx, result) => {
      const read = tx.objectStore('values').get('key');
      read.onsuccess = () => result(read.result);
    });
    await connection.close();
    return { blocked, value };
  });
  expect(result.blocked).toContain('blocked');
  expect(result.value).toBe('ok');
});

test('committed data survives a normal browser process restart', async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), 'notebook-storage-browser-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { headless: true });
    let page = await context.newPage();
    await openFixture(page, baseURL);
    await page.evaluate(async () => {
      const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      await provider.put(DB_CONFIG.STORES.CONFIG, { id: 'restart', value: 'retained' });
      await provider.close();
    });
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true });
    page = await context.newPage();
    await openFixture(page, baseURL);
    const restored = await page.evaluate(async () => {
      const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      const result = await provider.get(DB_CONFIG.STORES.CONFIG, 'restart');
      await provider.close();
      return result;
    });
    expect(restored).toEqual({ id: 'restart', value: 'retained' });
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('unsaved edits trigger a native exit dialog and commit after navigation is cancelled', async ({
  page,
}) => {
  // A real user gesture is needed for the browser's beforeunload dialog policy.
  await page.getByRole('button', { name: 'Activate test page' }).click();
  await page.evaluate(async () => {
    const { AutoSaveService, AutoSavePageLifecycle } = window.storageHarness;
    const service = AutoSaveService.getInstance({ debounceMs: 60000 });
    window.pageSaveBinding = new AutoSavePageLifecycle(service, document, window, (error) => {
      throw error;
    });
    await service.queueSave({
      notebookId: 'native-exit',
      notebookTitle: 'Retained notebook',
      cells: [{ id: 'title', type: 'markdown', content: '# Retained notebook', outputs: [] }],
      tasks: [],
      timestamp: Date.now(),
    });
  });
  const dialogPromise = page.waitForEvent('dialog');
  const navigation = page.evaluate(() => window.location.reload());
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await navigation;
  await page.waitForFunction(
    () => !window.storageHarness.AutoSaveService.getInstance().hasPending()
  );
  await page.reload();
  await page.waitForFunction(() => Boolean(window.storageHarness));
  const restored = await page.evaluate(async () => {
    const service = window.storageHarness.AutoSaveService.getInstance();
    const result = await service.load('native-exit');
    await service.dispose();
    return result;
  });
  expect(restored.notebookTitle).toBe('Retained notebook');
  expect(restored.cells[0].content).toBe('# Retained notebook');
});

for (const previousVersion of [2, 3]) {
  test(`v${previousVersion} upgrade preserves records and reconciles missing schema`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (previousVersion) => {
      const { DB_CONFIG, IndexedDBStorageProvider } = window.storageHarness;
      const original = await new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_CONFIG.NAME, previousVersion);
        open.onupgradeneeded = () => {
          open.result
            .createObjectStore(DB_CONFIG.STORES.NOTEBOOKS, { keyPath: 'id' })
            .put({ id: 'retained', name: 'Existing notebook' });
          open.result
            .createObjectStore(DB_CONFIG.STORES.FILES_CONTENT, { keyPath: 'fileId' })
            .put({ fileId: 'body', content: 'Existing content' });
          open.result.createObjectStore('unrelated').put('keep', 'key');
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      original.close();
      const provider = new IndexedDBStorageProvider();
      await provider.initialize();
      await provider.close();
      const upgraded = await new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_CONFIG.NAME);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const stores = Array.from(upgraded.objectStoreNames);
      const transaction = upgraded.transaction([
        DB_CONFIG.STORES.NOTEBOOKS,
        DB_CONFIG.STORES.FILES_CONTENT,
        'unrelated',
      ]);
      const notebookStore = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);
      const indexes = Array.from(notebookStore.indexNames);
      const read = (request) =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const records = await Promise.all([
        read(notebookStore.get('retained')),
        read(transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT).get('body')),
        read(transaction.objectStore('unrelated').get('key')),
      ]);
      const version = upgraded.version;
      upgraded.close();
      return { version, stores, indexes, records };
    }, previousVersion);
    expect(result.version).toBe(4);
    expect(result.stores).toContain('migration_ledger');
    expect(result.stores).toContain('split_files');
    expect(result.stores).toContain('tab_states');
    expect(result.indexes).toEqual(
      expect.arrayContaining(['lastAccessedAt', 'accessCount', 'updatedAt'])
    );
    expect(result.records).toEqual([
      { id: 'retained', name: 'Existing notebook' },
      { fileId: 'body', content: 'Existing content' },
      'keep',
    ]);
  });
}

test('an incompatible unique index aborts the upgrade without deleting v2 records', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { DB_CONFIG, IndexedDBStorageProvider } = window.storageHarness;
    const seed = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.NAME, 2);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(DB_CONFIG.STORES.FILES_METADATA, {
          keyPath: 'id',
        });
        store.put({ id: 'one', notebookId: 'same', filePath: 'same' });
        store.put({ id: 'two', notebookId: 'same', filePath: 'same' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    seed.close();
    const provider = new IndexedDBStorageProvider();
    let failed = false;
    try {
      await provider.initialize();
    } catch {
      failed = true;
    }
    await provider.close();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const version = db.version;
    const records = await new Promise((resolve, reject) => {
      const request = db
        .transaction(DB_CONFIG.STORES.FILES_METADATA)
        .objectStore(DB_CONFIG.STORES.FILES_METADATA)
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { failed, version, records };
  });
  expect(result.failed).toBe(true);
  expect(result.version).toBe(2);
  expect(result.records.map((record) => record.id)).toEqual(['one', 'two']);
});

test('scoped cache clearing preserves unrelated files and a subsequently admitted refresh', async ({
  page,
}) => {
  const files = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, SplitFileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new SplitFileRepository(provider);
    const file = (content) => ({
      name: 'file',
      content,
      type: 'text',
      size: content.length,
      lastModified: '2026-10-19',
    });
    await repository.saveFile('a', 'same', file('old'));
    await repository.saveFile('a', 'removed', file('remove'));
    await repository.saveFile('b', 'retained', file('other notebook'));
    await Promise.all([
      repository.clearNotebook('a'),
      repository.saveFile('a', 'same', file('new')),
    ]);
    const files = await provider.getAll(DB_CONFIG.STORES.SPLIT_FILES);
    await repository.clearAll();
    const empty = await provider.getAll(DB_CONFIG.STORES.SPLIT_FILES);
    await provider.close();
    return { files, empty };
  });
  expect(files.files.map((file) => [file.id, file.content])).toEqual([
    ['a::same', 'new'],
    ['b::retained', 'other notebook'],
  ]);
  expect(files.empty).toEqual([]);
});

for (const operation of ['clearNotebook', 'clearAll']) {
  test(`${operation} rolls back every cache deletion if its transaction fails`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (operation) => {
      const { IndexedDBStorageProvider, SplitFileRepository, DB_CONFIG } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      const store = DB_CONFIG.STORES.SPLIT_FILES;
      await provider.put(store, { id: 'a::one', notebookId: 'a' });
      await provider.put(store, { id: 'a::two', notebookId: 'a' });
      const repository = new SplitFileRepository({
        transaction: (names, mode, schedule) =>
          provider.transaction(names, mode, async (stores) => {
            await schedule(stores);
            throw new Error('abort after deletion requests');
          }),
      });
      let error;
      try {
        await repository[operation]('a');
      } catch (failure) {
        error = failure.message;
      }
      const records = await provider.getAll(store);
      await provider.close();
      return { error, records };
    }, operation);
    expect(result.error).toBe('abort after deletion requests');
    expect(result.records.map((record) => record.id)).toEqual(['a::one', 'a::two']);
  });
}

test('notebook maintenance shares atomic repositories without lost counter updates', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new NotebookRepository(provider);
    const notebook = {
      id: 'a',
      name: 'A',
      lastAccessedAt: 0,
      accessCount: 1,
      fileCount: 0,
      totalSize: 0,
      cacheEnabled: true,
    };
    await repository.saveNotebook(notebook);
    await repository.saveNotebook({ ...notebook, id: 'b', lastAccessedAt: Date.now() });
    await Promise.all(Array.from({ length: 20 }, () => repository.adjustNotebookStats('a', 1, 10)));
    const adjusted = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
    await provider.put(DB_CONFIG.STORES.FILES_METADATA, {
      id: 'a::one',
      notebookId: 'a',
      filePath: 'one',
      size: 5,
    });
    await provider.put(DB_CONFIG.STORES.FILES_METADATA, {
      id: 'a::two',
      notebookId: 'a',
      filePath: 'two',
      size: 7,
    });
    await provider.put(DB_CONFIG.STORES.FILES_METADATA, {
      id: 'b::one',
      notebookId: 'b',
      filePath: 'one',
      size: 100,
    });
    await repository.recalcNotebookStats('a');
    const recalculated = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
    await repository.logActivity('a', 'close');
    const stats = await repository.getNotebookStats('a');
    const inactive = await repository.getInactiveNotebooks(1000);
    await provider.close();
    return { adjusted, recalculated, stats, inactive };
  });
  expect(result.adjusted).toMatchObject({ fileCount: 20, totalSize: 200 });
  expect(result.recalculated).toMatchObject({ fileCount: 2, totalSize: 12 });
  expect(result.stats).toMatchObject({ fileCount: 2, totalSize: 12 });
  expect(result.stats.activities.some((activity) => activity.activityType === 'close')).toBe(true);
  expect(result.inactive.map((notebook) => notebook.id)).toEqual(['a']);
});

for (const operation of ['adjustNotebookStats', 'recalcNotebookStats']) {
  test(`${operation} does not acknowledge an aborted statistics update`, async ({ page }) => {
    const result = await page.evaluate(async (operation) => {
      const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      await provider.put(DB_CONFIG.STORES.NOTEBOOKS, { id: 'a', fileCount: 3, totalSize: 30 });
      const repository = new NotebookRepository({
        transaction: (names, mode, schedule) =>
          provider.transaction(names, mode, async (stores) => {
            await schedule(stores);
            throw new Error('statistics commit aborted');
          }),
      });
      let error;
      try {
        await repository[operation]('a', 1, 10);
      } catch (failure) {
        error = failure.message;
      }
      const notebook = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
      await provider.close();
      return { error, notebook };
    }, operation);
    expect(result.error).toBe('statistics commit aborted');
    expect(result.notebook).toEqual({ id: 'a', fileCount: 3, totalSize: 30 });
  });
}

test('file create, replace, edit and delete maintain notebook totals atomically', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new FileRepository(provider);
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'a',
      fileCount: 0,
      totalSize: 0,
      accessCount: 0,
    });
    const data = {
      notebookId: 'a',
      filePath: 'file',
      fileName: 'file',
      content: 'one',
      size: 3,
      lastModified: '2026-10-19',
    };
    await repository.saveFile(data);
    await repository.saveFile({ ...data, content: 'second', size: 6 });
    const replaced = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
    await repository.updateFileContent('a', 'file', '中文');
    const read = await repository.getFile('a', 'file');
    const edited = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
    await repository.deleteFile('a', 'file');
    const deleted = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
    const missing = await repository.getFile('a', 'file');
    await provider.close();
    return { replaced, edited, deleted, read, missing };
  });
  expect(result.replaced).toMatchObject({ fileCount: 1, totalSize: 6 });
  expect(result.edited).toMatchObject({ fileCount: 1, totalSize: 6, accessCount: 1 });
  expect(result.read.content).toBe('中文');
  expect(result.deleted).toMatchObject({ fileCount: 0, totalSize: 0 });
  expect(result.missing).toBeNull();
});

test('file accounting failure rolls back metadata and content together', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, { id: 'a', fileCount: 0, totalSize: 0 });
    const repository = new FileRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('atomic file commit rejected');
        }),
    });
    let error;
    try {
      await repository.saveFile({
        notebookId: 'a',
        filePath: 'file',
        fileName: 'file',
        content: 'new',
        size: 3,
        lastModified: '2026-10-19',
      });
    } catch (failure) {
      error = failure.message;
    }
    const notebook = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a');
    const files = await provider.getAll(DB_CONFIG.STORES.FILES_METADATA);
    const content = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
    const activities = await provider.getAll(DB_CONFIG.STORES.ACTIVITIES);
    await provider.close();
    return { error, notebook, files, content, activities };
  });
  expect(result).toEqual({
    error: 'atomic file commit rejected',
    notebook: { id: 'a', fileCount: 0, totalSize: 0 },
    files: [],
    content: [],
    activities: [],
  });
});

test('migrated file reads retain old plain payloads and list remote references without boolean keys', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new FileRepository(provider);
    await provider.put(DB_CONFIG.STORES.FILES_METADATA, {
      id: 'a::old',
      notebookId: 'a',
      filePath: 'old',
      hasLocalContent: true,
      accessCount: 0,
    });
    await provider.put(DB_CONFIG.STORES.FILES_CONTENT, {
      fileId: 'a::old',
      content: 'old plain payload',
      compressed: true,
    });
    const old = await repository.getFile('a', 'old');
    const data = {
      notebookId: 'a',
      filePath: 'remote',
      fileName: 'remote',
      content: 'preview',
      size: 100,
      remoteUrl: '/file',
      lastModified: '2026-10-19',
    };
    await repository.saveFile(data, { maxFileSize: 10 });
    await repository.saveFile({ ...data, notebookId: 'b' }, { maxFileSize: 10 });
    const all = await repository.getLargeFiles();
    const scoped = await repository.getLargeFiles('a');
    await provider.close();
    return { old, all, scoped };
  });
  expect(result.old.content).toBe('old plain payload');
  expect(result.all.map((file) => file.id)).toEqual(['a::remote', 'b::remote']);
  expect(result.scoped.map((file) => file.id)).toEqual(['a::remote']);
});

test('configuration patches serialize without losing concurrent settings', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    const defaults = await repository.getConfig();
    defaults.maxNotebooks = -1;
    const detachedDefaults = await repository.getConfig();
    await Promise.all([
      repository.updateConfig({ maxNotebooks: 75 }),
      repository.updateConfig({ compressionEnabled: false }),
      repository.ensureConfig(),
    ]);
    await repository.ensureConfig();
    const config = await repository.getConfig();
    const rows = await provider.getAll(DB_CONFIG.STORES.CONFIG);
    await provider.close();
    return { config, rows, detachedDefaults };
  });
  expect(result.detachedDefaults.maxNotebooks).toBe(50);
  expect(result.config).toMatchObject({
    id: 'config',
    maxNotebooks: 75,
    compressionEnabled: false,
  });
  expect(result.rows).toEqual([result.config]);
});

test('activity retention removes expired entries and preserves recent entries', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    const timestamp = Date.now();
    await provider.put(DB_CONFIG.STORES.ACTIVITIES, { id: 'old', timestamp: 0 });
    await provider.put(DB_CONFIG.STORES.ACTIVITIES, { id: 'recent', timestamp });
    await repository.cleanupActivities(60_000);
    const records = await provider.getAll(DB_CONFIG.STORES.ACTIVITIES);
    await provider.close();
    return records.map((record) => record.id);
  });
  expect(result).toEqual(['recent']);
});

for (const operation of ['updateConfig', 'cleanupActivities']) {
  test(`${operation} rejects and rolls back when commit fails`, async ({ page }) => {
    const result = await page.evaluate(async (operation) => {
      const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
        window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      const original = new StorageMaintenanceRepository(provider);
      await original.ensureConfig();
      const before = await original.getConfig();
      await provider.put(DB_CONFIG.STORES.ACTIVITIES, { id: 'expired', timestamp: 0 });
      const repository = new StorageMaintenanceRepository({
        transaction: (names, mode, schedule) =>
          provider.transaction(names, mode, async (stores) => {
            await schedule(stores);
            throw new Error('maintenance commit aborted');
          }),
      });
      let error;
      try {
        await repository[operation](operation === 'updateConfig' ? { maxNotebooks: 99 } : 1);
      } catch (failure) {
        error = failure.message;
      }
      const after = await original.getConfig();
      const activities = await provider.getAll(DB_CONFIG.STORES.ACTIVITIES);
      await provider.close();
      return { error, before, after, activities };
    }, operation);
    expect(result.error).toBe('maintenance commit aborted');
    expect(result.after).toEqual(result.before);
    expect(result.activities).toEqual([{ id: 'expired', timestamp: 0 }]);
  });
}

test('retention preview and cleanup keep recent notebooks without a deletion cap', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    const now = Date.now();
    await repository.updateConfig({ maxNotebooks: 2, retentionPeriod: 60_000 });
    await provider.transaction(
      [DB_CONFIG.STORES.NOTEBOOKS, DB_CONFIG.STORES.FILES_METADATA],
      'readwrite',
      (stores) => {
        for (let i = 0; i < 70; i++) {
          stores[DB_CONFIG.STORES.NOTEBOOKS].put({
            id: `b${i}`,
            retention: 'evictable',
            lastAccessedAt: now - i * 100,
          });
          stores[DB_CONFIG.STORES.FILES_METADATA].put({
            id: `b${i}::file`,
            notebookId: `b${i}`,
            size: 10,
          });
        }
        stores[DB_CONFIG.STORES.NOTEBOOKS].put({
          id: 'expired',
          retention: 'evictable',
          lastAccessedAt: 0,
        });
        stores[DB_CONFIG.STORES.FILES_METADATA].put({
          id: 'expired::file',
          notebookId: 'expired',
          size: 20,
        });
      }
    );
    const preview = await repository.getCleanupCandidates();
    const stats = await repository.cleanup();
    const remaining = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    const config = await repository.getConfig();
    await provider.close();
    return {
      inactive: preview.inactive.map((book) => book.id),
      excess: preview.excess.length,
      bytes: preview.totalBytesToFree,
      stats,
      remaining: remaining.map((book) => book.id),
      lastCleanup: config.lastCleanup,
    };
  });
  expect(result.inactive).toEqual(['expired']);
  expect(result.excess).toBe(68);
  expect(result.bytes).toBe(700);
  expect(result.stats).toMatchObject({ notebooksDeleted: 69, filesDeleted: 69, bytesFreed: 700 });
  expect(result.remaining).toEqual(['b0', 'b1']);
  expect(result.lastCleanup).toBeGreaterThan(0);
});

test('emergency cleanup preserves the newest notebooks', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    await repository.updateConfig({ maxNotebooks: 3 });
    for (let i = 0; i < 5; i++)
      await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
        id: `b${i}`,
        retention: 'evictable',
        lastAccessedAt: i,
      });
    const stats = await repository.cleanup('emergency');
    const remaining = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    await provider.close();
    return { stats, ids: remaining.map((book) => book.id) };
  });
  expect(result.stats.notebooksDeleted).toBe(3);
  expect(result.ids).toEqual(['b3', 'b4']);
});

test('access admitted before cleanup changes retention selection atomically', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const {
      IndexedDBStorageProvider,
      StorageMaintenanceRepository,
      NotebookRepository,
      DB_CONFIG,
    } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    await repository.updateConfig({ maxNotebooks: 1, retentionPeriod: 60_000 });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'stale',
      retention: 'evictable',
      lastAccessedAt: 0,
      accessCount: 1,
    });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'recent',
      retention: 'evictable',
      lastAccessedAt: Date.now() - 1000,
      accessCount: 1,
    });
    const preview = await repository.getCleanupCandidates();
    await Promise.all([
      new NotebookRepository(provider).updateAccessTime('stale'),
      repository.cleanup(),
    ]);
    const remaining = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    await provider.close();
    return {
      preview: preview.inactive.map((book) => book.id),
      remaining: remaining.map((book) => book.id),
    };
  });
  expect(result.preview).toEqual(['stale']);
  expect(result.remaining).toEqual(['stale']);
});

for (const abort of [false, true]) {
  test(`notebook cleanup ${abort ? 'rolls back' : 'commits'} all owned records and config together`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (abort) => {
      const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
        window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      const repository = new StorageMaintenanceRepository(provider);
      const S = DB_CONFIG.STORES;
      await repository.updateConfig({ maxNotebooks: 10, retentionPeriod: 60_000 });
      await provider.put(S.NOTEBOOKS, { id: 'old', retention: 'evictable', lastAccessedAt: 0 });
      await provider.put(S.FILES_METADATA, { id: 'old::file', notebookId: 'old', size: 42 });
      await provider.put(S.FILES_CONTENT, { fileId: 'old::file', content: 'retained on abort' });
      await provider.put(S.ACTIVITIES, { id: 'old::activity', notebookId: 'old', timestamp: 0 });
      await provider.put(S.TAB_STATES, { notebookId: 'old', tabList: [] });
      await provider.put(S.SPLIT_FILES, { id: 'old::split', notebookId: 'old', content: 'split' });
      const before = await repository.getConfig();
      const target = abort
        ? new StorageMaintenanceRepository({
            transaction: (names, mode, schedule) =>
              provider.transaction(names, mode, async (stores) => {
                await schedule(stores);
                throw new Error('retention commit aborted');
              }),
          })
        : repository;
      let error;
      try {
        await target.cleanup();
      } catch (failure) {
        error = failure.message;
      }
      const counts = await Promise.all(
        [
          S.NOTEBOOKS,
          S.FILES_METADATA,
          S.FILES_CONTENT,
          S.ACTIVITIES,
          S.TAB_STATES,
          S.SPLIT_FILES,
        ].map(async (name) => (await provider.getAll(name)).length)
      );
      const after = await repository.getConfig();
      await provider.close();
      return { counts, before, after, error };
    }, abort);
    expect(result.counts).toEqual(Array(6).fill(abort ? 1 : 0));
    if (abort) {
      expect(result.error).toBe('retention commit aborted');
      expect(result.after).toEqual(result.before);
    } else {
      expect(result.after.lastCleanup).toBeGreaterThan(result.before.lastCleanup);
    }
  });
}

test('overlapping cleanup transactions do not count deleted notebooks twice', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    await repository.updateConfig({ maxNotebooks: 0 });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'one',
      retention: 'evictable',
      lastAccessedAt: Date.now(),
    });
    const results = await Promise.all([
      repository.cleanup(),
      repository.cleanup('emergency'),
      repository.cleanup(),
    ]);
    await provider.close();
    return results.map((stats) => stats.notebooksDeleted);
  });
  expect(result).toEqual([1, 0, 0]);
});

test('explicit notebook deletion also removes its tab and split cache without touching another notebook', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    for (const id of ['deleted', 'retained']) {
      await provider.put(S.NOTEBOOKS, { id });
      await provider.put(S.TAB_STATES, { notebookId: id });
      await provider.put(S.SPLIT_FILES, { id: `${id}::split`, notebookId: id });
    }
    await new NotebookRepository(provider).deleteNotebook('deleted');
    const tabs = await provider.getAll(S.TAB_STATES);
    const splits = await provider.getAll(S.SPLIT_FILES);
    await provider.close();
    return { tabs, splits };
  });
  expect(result.tabs).toEqual([{ notebookId: 'retained' }]);
  expect(result.splits).toEqual([{ id: 'retained::split', notebookId: 'retained' }]);
});

test('a committed file write refreshes retention before cleanup selects candidates', async ({
  page,
}) => {
  const ids = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, FileRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const maintenance = new StorageMaintenanceRepository(provider);
    await maintenance.updateConfig({ maxNotebooks: 1, retentionPeriod: 60_000 });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'writing',
      retention: 'evictable',
      lastAccessedAt: 0,
      fileCount: 0,
      totalSize: 0,
    });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'other',
      retention: 'evictable',
      lastAccessedAt: Date.now() - 1000,
    });
    await Promise.all([
      new FileRepository(provider).saveFile({
        notebookId: 'writing',
        filePath: 'a',
        fileName: 'a',
        content: 'saved',
        size: 5,
        lastModified: 'today',
      }),
      maintenance.cleanup(),
    ]);
    const remaining = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    await provider.close();
    return remaining.map((book) => book.id);
  });
  expect(ids).toEqual(['writing']);
});

test('local autosave and historical documents survive automatic cleanup and reload', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, AutoSaveService, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const maintenance = new StorageMaintenanceRepository(provider);
    await maintenance.updateConfig({ maxNotebooks: 0, retentionPeriod: 0 });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, { id: 'historical', lastAccessedAt: 0 });
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'cache',
      lastAccessedAt: 0,
      retention: 'evictable',
    });
    // A local snapshot must promote a previously disposable cache before acknowledging save.
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, {
      id: 'document',
      lastAccessedAt: 0,
      retention: 'evictable',
    });
    const service = AutoSaveService.getInstance();
    await service.saveNow({
      notebookId: 'document',
      notebookTitle: 'Only local copy',
      cells: [{ id: 'text', type: 'markdown', content: 'Keep this content', outputs: [] }],
      tasks: [],
      timestamp: Date.now(),
    });
    const preview = await maintenance.getCleanupCandidates();
    const regular = await maintenance.cleanup();
    const emergency = await maintenance.cleanup('emergency');
    const records = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    await service.dispose();
    await provider.close();
    return {
      preview: [...preview.inactive, ...preview.excess].map((book) => book.id),
      regular,
      emergency,
      records,
    };
  });
  expect(result.preview).toEqual(['cache']);
  expect(result.regular.notebooksDeleted).toBe(1);
  expect(result.emergency.notebooksDeleted).toBe(0);
  expect(result.records.map((book) => book.id)).toEqual(['document', 'historical']);
  expect(result.records[0].retention).toBe('persistent');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.storageHarness));
  const content = await page.evaluate(async () => {
    const service = window.storageHarness.AutoSaveService.getInstance();
    const restored = await service.load('document');
    await service.dispose();
    return restored.cells[0].content;
  });
  expect(content).toBe('Keep this content');
});

test('explicit user deletion can remove a persistent document', async ({ page }) => {
  const remaining = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    await provider.put(DB_CONFIG.STORES.NOTEBOOKS, { id: 'document', retention: 'persistent' });
    await new NotebookRepository(provider).deleteNotebook('document');
    const records = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    await provider.close();
    return records;
  });
  expect(remaining).toEqual([]);
});

test('usage distinguishes logical remote sizes from stored local, split and orphan payloads', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    await provider.put(S.NOTEBOOKS, {
      id: 'book',
      createdAt: 17,
      lastAccessedAt: 23,
      accessCount: 2,
      totalSize: 999999,
      fileCount: 999,
    });
    await provider.put(S.FILES_METADATA, {
      id: 'book::local',
      notebookId: 'book',
      size: 7,
      isLargeFile: false,
    });
    await provider.put(S.FILES_METADATA, {
      id: 'book::remote',
      notebookId: 'book',
      size: 100000000,
      isLargeFile: true,
      hasLocalContent: false,
    });
    await provider.put(S.FILES_METADATA, { id: 'gone::orphan', notebookId: 'gone', size: 8 });
    await provider.put(S.FILES_CONTENT, { fileId: 'book::local', content: '你🙂' });
    await provider.put(S.FILES_CONTENT, { fileId: 'gone::orphan', content: 'orphan' });
    await provider.put(S.FILES_CONTENT, { fileId: 'missing-metadata', content: 'x' });
    await provider.put(S.SPLIT_FILES, {
      id: 'book::split',
      notebookId: 'book',
      content: '预览',
      size: 999,
    });
    await provider.put(S.SPLIT_FILES, { id: 'gone::split', notebookId: 'gone', content: 'z' });
    const repository = new StorageMaintenanceRepository(provider);
    const stats = await repository.getStorageStats();
    const notebook = await provider.get(S.NOTEBOOKS, 'book');
    await provider.close();
    return { stats, notebook };
  });
  expect(result.stats).toEqual({
    totalNotebooks: 1,
    totalFiles: 2,
    totalSize: 100000007,
    largeFilesCount: 1,
    oldestNotebook: 17,
    newestNotebook: 17,
    mostAccessedNotebook: 'book',
    localContentBytes: 14,
    splitContentBytes: 7,
    orphanContentBytes: 8,
  });
  expect(result.notebook.accessCount).toBe(2);
  expect(result.notebook.lastAccessedAt).toBe(23);
});

test('usage reads one committed revision during a concurrent content update', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    await provider.put(S.NOTEBOOKS, {
      id: 'book',
      createdAt: 1,
      lastAccessedAt: 1,
      accessCount: 1,
    });
    await provider.put(S.FILES_METADATA, { id: 'file', notebookId: 'book', size: 1 });
    await provider.put(S.FILES_CONTENT, { fileId: 'file', content: 'a' });
    const repository = new StorageMaintenanceRepository(provider);
    const reading = repository.getStorageStats();
    const writing = provider.transaction(
      [S.FILES_METADATA, S.FILES_CONTENT],
      'readwrite',
      (stores) => {
        stores[S.FILES_METADATA].put({ id: 'file', notebookId: 'book', size: 5 });
        stores[S.FILES_CONTENT].put({ fileId: 'file', content: 'later' });
      }
    );
    const [before] = await Promise.all([reading, writing]);
    const after = await repository.getStorageStats();
    await provider.close();
    return { before, after };
  });
  expect([result.before.totalSize, result.before.localContentBytes]).toEqual([1, 1]);
  expect([result.after.totalSize, result.after.localContentBytes]).toEqual([5, 5]);
});

test('empty storage usage has explicit zero totals and timestamps', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const stats = await new StorageMaintenanceRepository(provider).getStorageStats();
    await provider.close();
    return stats;
  });
  expect(result).toEqual({
    totalNotebooks: 0,
    totalFiles: 0,
    totalSize: 0,
    largeFilesCount: 0,
    oldestNotebook: 0,
    newestNotebook: 0,
    mostAccessedNotebook: '',
    localContentBytes: 0,
    splitContentBytes: 0,
    orphanContentBytes: 0,
  });
});

test('usage does not publish a partial snapshot when the read transaction fails', async ({
  page,
}) => {
  const error = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('usage read aborted');
        }),
    });
    try {
      await repository.getStorageStats();
    } catch (failure) {
      return failure.message;
    } finally {
      await provider.close();
    }
  });
  expect(error).toBe('usage read aborted');
});

test('content budget uses local and split payloads, preserves remote-only caches and reports protected pressure', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    const S = DB_CONFIG.STORES;
    await repository.updateConfig({ maxNotebooks: 10, maxTotalSize: 12, retentionPeriod: 60_000 });
    const now = Date.now();
    for (const [id, age, retention] of [
      ['old', 30, 'evictable'],
      ['recent', 10, 'evictable'],
      ['remote', 50, 'evictable'],
      ['document', 100, 'persistent'],
    ]) {
      await provider.put(S.NOTEBOOKS, { id, lastAccessedAt: now - age, retention });
      await provider.put(S.FILES_METADATA, {
        id: `${id}::file`,
        notebookId: id,
        size: id === 'remote' ? 100000000 : 999,
      });
    }
    await provider.put(S.FILES_CONTENT, { fileId: 'old::file', content: '你' });
    await provider.put(S.SPLIT_FILES, { id: 'old::split', notebookId: 'old', content: '🙂' });
    await provider.put(S.FILES_CONTENT, { fileId: 'recent::file', content: '12345' });
    await provider.put(S.FILES_CONTENT, { fileId: 'document::file', content: '123456' });
    await provider.put(S.FILES_CONTENT, { fileId: 'orphan', content: 'x' });
    const preview = await repository.getCleanupCandidates();
    const regular = await repository.cleanup();
    const kept = (await provider.getAll(S.NOTEBOOKS)).map((book) => book.id);
    await repository.updateConfig({ maxTotalSize: 0 });
    const constrained = await repository.cleanup();
    const remaining = (await provider.getAll(S.NOTEBOOKS)).map((book) => book.id);
    const usage = await repository.getStorageStats();
    await provider.close();
    return { preview, regular, kept, constrained, remaining, usage };
  });
  expect(result.preview.excess.map((book) => book.id)).toEqual(['old']);
  expect(result.preview).toMatchObject({
    contentBytesFreed: 7,
    remainingContentBytes: 12,
    overBudgetBytes: 0,
  });
  expect(result.regular).toMatchObject({
    notebooksDeleted: 1,
    contentBytesFreed: 7,
    remainingContentBytes: 12,
    overBudgetBytes: 0,
  });
  expect(result.kept).toEqual(['document', 'recent', 'remote']);
  expect(result.constrained).toMatchObject({
    notebooksDeleted: 1,
    contentBytesFreed: 5,
    remainingContentBytes: 7,
    overBudgetBytes: 7,
  });
  expect(result.remaining).toEqual(['document', 'remote']);
  expect(result.usage.localContentBytes + result.usage.splitContentBytes).toBe(7);
});

test('content-budget cleanup abort preserves every measured payload', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    const S = DB_CONFIG.STORES;
    await repository.updateConfig({ maxNotebooks: 10, maxTotalSize: 0 });
    await provider.put(S.NOTEBOOKS, {
      id: 'cache',
      retention: 'evictable',
      lastAccessedAt: Date.now(),
    });
    await provider.put(S.FILES_METADATA, { id: 'cache::file', notebookId: 'cache', size: 4 });
    await provider.put(S.FILES_CONTENT, { fileId: 'cache::file', content: 'keep' });
    const before = await repository.getConfig();
    const failing = new StorageMaintenanceRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('budget cleanup aborted');
        }),
    });
    let error;
    try {
      await failing.cleanup();
    } catch (failure) {
      error = failure.message;
    }
    const usage = await repository.getStorageStats();
    const after = await repository.getConfig();
    await provider.close();
    return { error, usage, before, after };
  });
  expect(result.error).toBe('budget cleanup aborted');
  expect(result.usage.totalNotebooks).toBe(1);
  expect(result.usage.localContentBytes).toBe(4);
  expect(result.after).toEqual(result.before);
});

test('snapshot replacement and stale metadata refresh preserve transaction-owned file totals', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, FileRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const notebooks = new NotebookRepository(provider);
    const files = new FileRepository(provider);
    const metadata = {
      id: 'book',
      name: 'Book',
      lastAccessedAt: 1,
      accessCount: 1,
      fileCount: 99,
      totalSize: 999,
      cacheEnabled: true,
    };
    const created = await notebooks.saveNotebook(metadata);
    await files.saveFile({
      notebookId: 'book',
      filePath: 'attachment',
      fileName: 'attachment',
      content: 'hello',
      size: 5,
      lastModified: 'today',
    });
    const snapshot = {
      notebookId: 'book',
      filePath: 'snapshot',
      fileName: 'snapshot',
      content: 'first',
      size: 5,
      lastModified: 'today',
    };
    await notebooks.saveNotebookSnapshot(snapshot, metadata);
    const first = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'book');
    await notebooks.updateAccessTime('book');
    await notebooks.saveNotebookSnapshot(
      { ...snapshot, content: 'replacement', size: 11 },
      metadata
    );
    const replaced = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'book');
    await Promise.all([
      files.saveFile({
        ...snapshot,
        filePath: 'another',
        fileName: 'another',
        content: 'ab',
        size: 2,
      }),
      notebooks.saveNotebook({ ...metadata, name: 'Renamed' }),
    ]);
    const refreshed = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'book');
    const actual = await notebooks.getNotebookStats('book');
    await provider.close();
    return { created, first, replaced, refreshed, actual };
  });
  expect(result.created).toMatchObject({ fileCount: 0, totalSize: 0 });
  expect(result.first).toMatchObject({ fileCount: 2, totalSize: 10 });
  expect(result.replaced).toMatchObject({ fileCount: 2, totalSize: 16, accessCount: 2 });
  expect(result.refreshed).toMatchObject({
    name: 'Renamed',
    fileCount: 3,
    totalSize: 18,
    accessCount: 2,
  });
  expect(result.actual).toMatchObject({ fileCount: 3, totalSize: 18 });
});

test('failed snapshot commit rolls back content, notebook counters and retention promotion', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    const notebook = {
      id: 'cache',
      name: 'Cache',
      lastAccessedAt: 1,
      accessCount: 1,
      fileCount: 1,
      totalSize: 3,
      retention: 'evictable',
      cacheEnabled: true,
    };
    await provider.put(S.NOTEBOOKS, notebook);
    await provider.put(S.FILES_METADATA, { id: 'cache::snapshot', notebookId: 'cache', size: 3 });
    await provider.put(S.FILES_CONTENT, { fileId: 'cache::snapshot', content: 'old' });
    const failing = new NotebookRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('snapshot accounting aborted');
        }),
    });
    let error;
    try {
      await failing.saveNotebookSnapshot(
        {
          notebookId: 'cache',
          filePath: 'snapshot',
          fileName: 'snapshot',
          content: 'new snapshot',
          size: 12,
          lastModified: 'today',
        },
        notebook
      );
    } catch (failure) {
      error = failure.message;
    }
    const stored = await provider.get(S.NOTEBOOKS, 'cache');
    const content = await provider.get(S.FILES_CONTENT, 'cache::snapshot');
    const activity = await provider.getAll(S.ACTIVITIES);
    await provider.close();
    return { error, stored, content, activity };
  });
  expect(result.error).toBe('snapshot accounting aborted');
  expect(result.stored).toMatchObject({ fileCount: 1, totalSize: 3, retention: 'evictable' });
  expect(result.content.content).toBe('old');
  expect(result.activity).toEqual([]);
});

test('concurrent first file writes create one persistent parent with exact totals', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const files = new FileRepository(provider);
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        files.saveFile({
          notebookId: 'new-book',
          filePath: `file${i}`,
          fileName: `file${i}`,
          content: 'ab',
          size: 2,
          lastModified: 'today',
        })
      )
    );
    const notebooks = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    const metadata = await provider.getAll(DB_CONFIG.STORES.FILES_METADATA);
    await provider.close();
    return { notebooks, metadata };
  });
  expect(result.notebooks).toHaveLength(1);
  expect(result.notebooks[0]).toMatchObject({
    id: 'new-book',
    fileCount: 5,
    totalSize: 10,
    retention: 'persistent',
  });
  expect(result.metadata).toHaveLength(5);
});

test('updating orphan content establishes parent ownership and counts every associated file', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    await provider.put(S.FILES_METADATA, { id: 'book::a', notebookId: 'book', size: 3 });
    await provider.put(S.FILES_METADATA, { id: 'book::b', notebookId: 'book', size: 7 });
    await new FileRepository(provider).updateFileContent('book', 'a', '你好');
    const notebook = await provider.get(S.NOTEBOOKS, 'book');
    await provider.close();
    return notebook;
  });
  expect(result).toMatchObject({ fileCount: 2, totalSize: 13, retention: 'persistent' });
});

test('an aborted first file save leaves neither a parent nor child records', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const files = new FileRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('parent creation aborted');
        }),
    });
    let error;
    try {
      await files.saveFile({
        notebookId: 'new',
        filePath: 'a',
        fileName: 'a',
        content: 'data',
        size: 4,
        lastModified: 'today',
      });
    } catch (failure) {
      error = failure.message;
    }
    const S = DB_CONFIG.STORES;
    const counts = await Promise.all(
      [S.NOTEBOOKS, S.FILES_METADATA, S.FILES_CONTENT, S.ACTIVITIES].map(
        async (name) => (await provider.getAll(name)).length
      )
    );
    await provider.close();
    return { error, counts };
  });
  expect(result.error).toBe('parent creation aborted');
  expect(result.counts).toEqual([0, 0, 0, 0]);
});

test('deleting an orphan file does not recreate a deleted notebook', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    await provider.put(S.FILES_METADATA, { id: 'gone::file', notebookId: 'gone', size: 3 });
    await provider.put(S.FILES_CONTENT, { fileId: 'gone::file', content: 'old' });
    await new FileRepository(provider).deleteFile('gone', 'file');
    const notebooks = await provider.getAll(S.NOTEBOOKS);
    const files = await provider.getAll(S.FILES_METADATA);
    await provider.close();
    return { notebooks, files };
  });
  expect(result).toEqual({ notebooks: [], files: [] });
});

test('file saves apply committed configuration thresholds while explicit overrides and snapshots stay local', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      IndexedDBStorageProvider,
      StorageMaintenanceRepository,
      FileRepository,
      NotebookRepository,
      DB_CONFIG,
    } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const maintenance = new StorageMaintenanceRepository(provider);
    const files = new FileRepository(provider);
    const data = {
      notebookId: 'book',
      filePath: 'a',
      fileName: 'a',
      content: 'abcde',
      size: 5,
      lastModified: 'today',
      remoteUrl: '/remote/a',
    };
    await maintenance.updateConfig({ maxFileSize: 10 });
    const local = await files.saveFile(data);
    const [, remote] = await Promise.all([
      maintenance.updateConfig({ maxFileSize: 1 }),
      files.saveFile(data),
    ]);
    const removed = await provider.get(DB_CONFIG.STORES.FILES_CONTENT, 'book::a');
    const override = await files.saveFile(data, { maxFileSize: 10 });
    const snapshot = await new NotebookRepository(provider).saveNotebookSnapshot(data, {
      id: 'book',
      name: 'Book',
      accessCount: 1,
      lastAccessedAt: Date.now(),
      cacheEnabled: true,
    });
    const content = await provider.get(DB_CONFIG.STORES.FILES_CONTENT, 'book::a');
    await provider.close();
    return { local, remote, removed, override, snapshot, content };
  });
  expect(result.local.storageType).toBe('local');
  expect(result.remote.storageType).toBe('remote');
  expect(result.removed).toBeUndefined();
  expect(result.override.storageType).toBe('local');
  expect(result.snapshot.storageType).toBe('local');
  expect(result.content.content).toBe('abcde');
});

test('invalid configuration patches reject without overwriting the saved configuration', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    await repository.ensureConfig();
    const before = await repository.getConfig();
    const errors = [];
    for (const patch of [
      { maxFileSize: -1 },
      { cleanupInterval: NaN },
      { compressionEnabled: 'true' },
    ]) {
      try {
        await repository.updateConfig(patch);
      } catch (failure) {
        errors.push(failure.message);
      }
    }
    const after = await repository.getConfig();
    await provider.close();
    return { errors, before, after };
  });
  expect(result.errors).toHaveLength(3);
  expect(result.errors.every((error) => error.includes('Invalid storage configuration'))).toBe(
    true
  );
  expect(result.after).toEqual(result.before);
});

test('malformed stored config rejects initialization, cleanup and cache writes until repaired', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageMaintenanceRepository, FileRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    await repository.ensureConfig();
    const before = await repository.getConfig();
    await provider.put(DB_CONFIG.STORES.CONFIG, { ...before, maxFileSize: -1 });
    const files = new FileRepository(provider);
    const data = {
      notebookId: 'book',
      filePath: 'a',
      fileName: 'a',
      content: 'a',
      size: 1,
      lastModified: 'today',
    };
    const errors = [];
    for (const operation of [
      () => repository.ensureConfig(),
      () => repository.getConfig(),
      () => repository.cleanup(),
      () => files.saveFile(data),
    ]) {
      try {
        await operation();
      } catch (failure) {
        errors.push(failure.message);
      }
    }
    const pending = await provider.getAll(DB_CONFIG.STORES.FILES_METADATA);
    await repository.updateConfig({ maxFileSize: before.maxFileSize });
    const saved = await files.saveFile(data);
    await provider.close();
    return { errors, pending, saved };
  });
  expect(result.errors).toHaveLength(4);
  expect(result.errors.every((error) => error.includes('maxFileSize'))).toBe(true);
  expect(result.pending).toEqual([]);
  expect(result.saved.hasLocalContent).toBe(true);
});

test('same-millisecond notebook and file events remain individually recorded', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, FileRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const notebooks = new NotebookRepository(provider);
    const files = new FileRepository(provider);
    const originalNow = Date.now;
    Date.now = () => 123456;
    try {
      const notebook = {
        id: 'book',
        name: 'Book',
        lastAccessedAt: Date.now(),
        accessCount: 1,
        cacheEnabled: true,
      };
      await notebooks.saveNotebook(notebook);
      await Promise.all(Array.from({ length: 3 }, () => notebooks.saveNotebook(notebook)));
      await Promise.all(
        Array.from({ length: 3 }, () =>
          files.saveFile({
            notebookId: 'book',
            filePath: 'file',
            fileName: 'file',
            content: 'same',
            size: 4,
            lastModified: 'today',
          })
        )
      );
      await Promise.all(Array.from({ length: 3 }, () => files.getFile('book', 'file')));
      await Promise.all(Array.from({ length: 3 }, () => notebooks.logActivity('book', 'close')));
      await files.deleteFile('book', 'file');
      const activities = await provider.getAll(DB_CONFIG.STORES.ACTIVITIES);
      const stats = await notebooks.getNotebookStats('book');
      await provider.close();
      return { activities, stats };
    } finally {
      Date.now = originalNow;
    }
  });
  expect(result.activities).toHaveLength(14);
  expect(new Set(result.activities.map((event) => event.id)).size).toBe(14);
  expect(result.activities.every((event) => event.timestamp === 123456)).toBe(true);
  const count = (type) => result.activities.filter((event) => event.activityType === type).length;
  expect([
    count('open'),
    count('file_create'),
    count('file_access'),
    count('close'),
    count('file_delete'),
  ]).toEqual([4, 3, 3, 3, 1]);
  expect(result.stats.activities).toHaveLength(14);
  expect(result.stats.lastActivity).toBe(123456);
});

test('an activity key collision aborts the file transaction instead of overwriting history', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    const original = { id: 'existing', notebookId: 'book', activityType: 'close', timestamp: 1 };
    await provider.put(S.ACTIVITIES, original);
    const repository = new FileRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, (stores) =>
          schedule({
            ...stores,
            [S.ACTIVITIES]: {
              add: (record) => stores[S.ACTIVITIES].add({ ...record, id: 'existing' }),
            },
          })
        ),
    });
    let error;
    try {
      await repository.saveFile({
        notebookId: 'book',
        filePath: 'file',
        fileName: 'file',
        content: 'new',
        size: 3,
        lastModified: 'today',
      });
    } catch (failure) {
      error = failure.name;
    }
    const activity = await provider.getAll(S.ACTIVITIES);
    const counts = await Promise.all(
      [S.NOTEBOOKS, S.FILES_METADATA, S.FILES_CONTENT].map(
        async (name) => (await provider.getAll(name)).length
      )
    );
    await provider.close();
    return { error, activity, original, counts };
  });
  expect(result.error).toBeDefined();
  expect(result.activity).toEqual([result.original]);
  expect(result.counts).toEqual([0, 0, 0]);
});

test('a cold provider captures nested write input before opening storage', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const input = { id: 'original', nested: { text: 'before' } };
    const writing = provider.put(DB_CONFIG.STORES.CONFIG, input);
    input.id = 'mutated';
    input.nested.text = 'after';
    await writing;
    const records = await provider.getAll(DB_CONFIG.STORES.CONFIG);
    await provider.close();
    return records;
  });
  expect(result).toEqual([{ id: 'original', nested: { text: 'before' } }]);
});

test('file and notebook writes retain their admitted identities, payloads and options', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, FileRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const notebooks = new NotebookRepository(provider);
    const metadata = {
      id: 'book',
      name: 'Original',
      accessCount: 1,
      lastAccessedAt: 1,
      cacheEnabled: true,
    };
    const savingNotebook = notebooks.saveNotebook(metadata);
    metadata.id = 'other';
    metadata.name = 'Later';
    await savingNotebook;
    const data = {
      notebookId: 'book',
      filePath: 'file',
      fileName: 'file',
      content: 'original',
      size: 8,
      lastModified: 'today',
      remoteUrl: '/remote/file',
    };
    const options = { maxFileSize: 100 };
    const savingFile = new FileRepository(provider).saveFile(data, options);
    data.notebookId = 'other';
    data.content = 'mutated';
    options.maxFileSize = 0;
    await savingFile;
    const snapshotMetadata = { ...metadata, id: 'book', name: 'Snapshot' };
    const savingSnapshot = notebooks.saveNotebookSnapshot(
      { ...data, notebookId: 'book', filePath: 'snapshot', content: 'saved', size: 5 },
      snapshotMetadata
    );
    snapshotMetadata.id = 'other';
    snapshotMetadata.name = 'Too late';
    await savingSnapshot;
    const books = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    const file = await provider.get(DB_CONFIG.STORES.FILES_CONTENT, 'book::file');
    const snapshot = await provider.get(DB_CONFIG.STORES.FILES_CONTENT, 'book::snapshot');
    await provider.close();
    return { books, file, snapshot };
  });
  expect(result.books).toHaveLength(1);
  expect(result.books[0]).toMatchObject({
    id: 'book',
    name: 'Snapshot',
    fileCount: 2,
    totalSize: 13,
  });
  expect(result.file.content).toBe('original');
  expect(result.snapshot.content).toBe('saved');
});

test('config patches and nested activity metadata capture the invocation-time values', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      IndexedDBStorageProvider,
      StorageMaintenanceRepository,
      NotebookRepository,
      DB_CONFIG,
    } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new StorageMaintenanceRepository(provider);
    const patch = { maxNotebooks: 75 };
    const writing = repository.updateConfig(patch);
    patch.maxNotebooks = -1;
    await writing;
    const metadata = { nested: { version: 1 } };
    const logging = new NotebookRepository(provider).logActivity(
      'book',
      'close',
      undefined,
      metadata
    );
    metadata.nested.version = 2;
    await logging;
    const config = await repository.getConfig();
    const events = await provider.getAll(DB_CONFIG.STORES.ACTIVITIES);
    await provider.close();
    return { config, events };
  });
  expect(result.config.maxNotebooks).toBe(75);
  expect(result.events[0].metadata).toEqual({ nested: { version: 1 } });
});

test('transaction store scope cannot change while awaiting the connection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const names = [DB_CONFIG.STORES.CONFIG];
    const writing = provider.transaction(names, 'readwrite', async (stores) => {
      stores[DB_CONFIG.STORES.CONFIG].put({ id: 'scope', value: 'original' });
    });
    names[0] = DB_CONFIG.STORES.NOTEBOOKS;
    await writing;
    const config = await provider.get(DB_CONFIG.STORES.CONFIG, 'scope');
    await provider.close();
    return config;
  });
  expect(result).toEqual({ id: 'scope', value: 'original' });
});

test('the application file-cache facade captures input before its dynamic import', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { FileCache } = window.storageHarness;
    const data = { notebookId: 'book', path: 'file', name: 'file', content: 'first', size: 5 };
    const writing = FileCache.saveFile(data);
    data.notebookId = 'other';
    data.content = 'later';
    await writing;
    return {
      file: await FileCache.getFile('book', 'file'),
      other: await FileCache.getNotebook('other'),
    };
  });
  expect(result.file.content).toBe('first');
  expect(result.other).toBeNull();
});

test('editing a remote file commits a consistent local revision and preserves access history', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, StorageMaintenanceRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const files = new FileRepository(provider);
    const original = await files.saveFile(
      {
        notebookId: 'book',
        filePath: 'large',
        fileName: 'large',
        content: 'remote preview',
        size: 100,
        remoteUrl: '/remote/large',
        lastModified: 'old',
      },
      { maxFileSize: 1 }
    );
    await files.getFile('book', 'large');
    const before = await provider.get(DB_CONFIG.STORES.FILES_METADATA, original.id);
    await files.updateFileContent('book', 'large', '你好');
    const metadata = await provider.get(DB_CONFIG.STORES.FILES_METADATA, original.id);
    const content = await provider.get(DB_CONFIG.STORES.FILES_CONTENT, original.id);
    const notebook = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'book');
    const large = await files.getLargeFiles('book');
    const usage = await new StorageMaintenanceRepository(provider).getStorageStats();
    await provider.close();
    return { before, metadata, content, notebook, large, usage };
  });
  expect(result.metadata).toMatchObject({
    storageType: 'local',
    hasLocalContent: true,
    isLargeFile: false,
    size: 6,
    remoteUrl: '/remote/large',
  });
  expect(result.metadata.contentPreview).toBeUndefined();
  expect(result.metadata.cachedAt).toBe(result.before.cachedAt);
  expect(result.metadata.accessCount).toBe(result.before.accessCount);
  expect(result.content.content).toBe('你好');
  expect(result.notebook).toMatchObject({ fileCount: 1, totalSize: 6 });
  expect(result.large).toEqual([]);
  expect(result.usage).toMatchObject({ largeFilesCount: 0, localContentBytes: 6 });
});

test('failed remote-to-local conversion retains the complete remote revision', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, FileRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const S = DB_CONFIG.STORES;
    const original = await new FileRepository(provider).saveFile(
      {
        notebookId: 'book',
        filePath: 'large',
        fileName: 'large',
        content: 'remote preview',
        size: 100,
        remoteUrl: '/remote/large',
        lastModified: 'old',
      },
      { maxFileSize: 1 }
    );
    const failing = new FileRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('conversion aborted');
        }),
    });
    let error;
    try {
      await failing.updateFileContent('book', 'large', 'edited');
    } catch (failure) {
      error = failure.message;
    }
    const after = await provider.get(S.FILES_METADATA, original.id);
    const content = await provider.get(S.FILES_CONTENT, original.id);
    const notebook = await provider.get(S.NOTEBOOKS, 'book');
    await provider.close();
    return { error, original, after, content, notebook };
  });
  expect(result.error).toBe('conversion aborted');
  expect(result.after).toEqual(result.original);
  expect(result.content).toBeUndefined();
  expect(result.notebook).toMatchObject({ fileCount: 1, totalSize: 100 });
});

test('application provider initializes configuration before rendering and supports close/remount', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.unmountPersistenceProbe = window.storageHarness.mountPersistenceProbe();
  });
  await expect(page.getByText('Storage probe ready')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, StorageManager, DB_CONFIG } = window.storageHarness;
    const reader = new IndexedDBStorageProvider();
    const config = await reader.get(DB_CONFIG.STORES.CONFIG, 'config');
    await reader.close();
    window.unmountPersistenceProbe();
    await StorageManager.close();
    let error;
    try {
      await StorageManager.getConfig();
    } catch (failure) {
      error = failure.message;
    }
    window.unmountPersistenceProbe = window.storageHarness.mountPersistenceProbe();
    return { config, error };
  });
  expect(result.config).toMatchObject({ id: 'config', maxNotebooks: 50 });
  expect(result.error).toContain('closed');
  await expect(page.getByText('Storage probe ready')).toBeVisible();
  await page.evaluate(async () => {
    window.unmountPersistenceProbe();
    await window.storageHarness.StorageManager.close();
  });
});

test('probing an absent historical database does not create it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { LegacyDatabaseReader } = window.storageHarness;
    const probe = await new LegacyDatabaseReader('absent-history', 'probe', 1000).run();
    const databases = await indexedDB.databases();
    return { probe, names: databases.map((database) => database.name) };
  });
  expect(result.probe).toEqual({ hasFiles: false, files: [] });
  expect(result.names).not.toContain('absent-history');
});

test('historical reads and migration include every matching source store', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { LegacyDatabaseReader, DataMigration, IndexedDBStorageProvider, DB_CONFIG } =
      window.storageHarness;
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('easyremote-file-cache', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('aaa_metadata');
        open.result
          .createObjectStore('files', { keyPath: 'id' })
          .put({ id: 'a', notebookId: 'history', path: 'a', name: 'a', content: 'one', size: 3 });
        open.result
          .createObjectStore('extra_cache', { keyPath: 'id' })
          .put({ id: 'b', notebookId: 'history', path: 'b', name: 'b', content: 'two', size: 3 });
      };
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
    });
    const probe = await new LegacyDatabaseReader('easyremote-file-cache', 'probe', 1000).run();
    const read = await new LegacyDatabaseReader('easyremote-file-cache', 'files', 1000).run();
    const needed = await DataMigration.isMigrationNeeded();
    const stats = await DataMigration.migrate();
    const provider = new IndexedDBStorageProvider();
    const files = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
    const original = await new LegacyDatabaseReader('easyremote-file-cache', 'files', 1000).run();
    await provider.close();
    return { probe, read, needed, stats, files, original };
  });
  expect(result.probe.hasFiles).toBe(true);
  expect(result.read.files.map((file) => file.id).sort()).toEqual(['a', 'b']);
  expect(result.needed).toBe(true);
  expect(result.stats).toMatchObject({ notebooksMigrated: 1, filesMigrated: 2, errors: [] });
  expect(result.files.map((file) => file.content).sort()).toEqual(['one', 'two']);
  expect(result.original.files).toEqual(result.read.files);
});

test('notebook imports are atomic, conflict-safe and idempotent across connections', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const second = new IndexedDBStorageProvider();
    const repository = new NotebookRepository(provider);
    const notebook = {
      id: 'import',
      name: 'Historical',
      lastAccessedAt: 1,
      accessCount: 1,
      cacheEnabled: true,
    };
    const file = (path, content) => ({
      notebookId: 'import',
      filePath: path,
      fileName: path,
      content,
      size: content.length,
      lastModified: 'old',
    });
    const S = DB_CONFIG.STORES;
    const failed = new NotebookRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('import aborted');
        }),
    });
    let aborted;
    try {
      await failed.importNotebook(notebook, [file('a', 'one'), file('b', 'two')]);
    } catch (error) {
      aborted = error.message;
    }
    const afterAbort = await Promise.all([
      provider.getAll(S.NOTEBOOKS),
      provider.getAll(S.FILES_METADATA),
      provider.getAll(S.FILES_CONTENT),
      provider.getAll(S.ACTIVITIES),
    ]);
    const concurrent = await Promise.all([
      repository.importNotebook(notebook, [file('a', 'one'), file('b', 'two')]),
      new NotebookRepository(second).importNotebook(notebook, [file('a', 'one'), file('b', 'two')]),
    ]);
    const original = await provider.get(S.NOTEBOOKS, 'import');
    await provider.put(S.NOTEBOOKS, { ...original, name: 'Edited name' });
    let conflict;
    try {
      await repository.importNotebook(notebook, [file('c', 'new'), file('a', 'different')]);
    } catch (error) {
      conflict = error.message;
    }
    const repeat = await repository.importNotebook(notebook, [file('a', 'one'), file('b', 'two')]);
    const after = await provider.get(S.NOTEBOOKS, 'import');
    const bodies = await provider.getAll(S.FILES_CONTENT);
    const activities = await provider.getAll(S.ACTIVITIES);
    const merged = await repository.importNotebook(notebook, [
      file('a', 'one'),
      file('c', 'three'),
    ]);
    const afterMerge = await provider.get(S.NOTEBOOKS, 'import');
    let sourceConflict;
    try {
      await repository.importNotebook(notebook, [file('d', 'one'), file('d', 'two')]);
    } catch (error) {
      sourceConflict = error.message;
    }
    const invalidBody = await provider.get(S.FILES_CONTENT, 'import::d');
    await provider.close();
    await second.close();
    return {
      aborted,
      afterAbort,
      concurrent,
      conflict,
      repeat,
      after,
      bodies,
      activities,
      merged,
      afterMerge,
      sourceConflict,
      invalidBody,
    };
  });
  expect(result.aborted).toBe('import aborted');
  expect(result.afterAbort).toEqual([[], [], [], []]);
  expect(result.concurrent.sort()).toEqual([0, 2]);
  expect(result.conflict).toContain('Destination file conflict');
  expect(result.repeat).toBe(0);
  expect(result.after).toMatchObject({
    name: 'Edited name',
    fileCount: 2,
    totalSize: 6,
    retention: 'persistent',
  });
  expect(result.bodies.map((file) => file.content).sort()).toEqual(['one', 'two']);
  expect(result.activities).toHaveLength(1);
  expect(result.merged).toBe(1);
  expect(result.afterMerge).toMatchObject({ name: 'Edited name', fileCount: 3, totalSize: 11 });
  expect(result.sourceConflict).toContain('Conflicting source file');
  expect(result.invalidBody).toBeUndefined();
});

test('forced historical migration preserves destination edits and unrelated notebooks', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DataMigration, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const notebooks = new NotebookRepository(provider);
    const metadata = (id) => ({
      id,
      name: id,
      lastAccessedAt: 1,
      accessCount: 1,
      cacheEnabled: true,
    });
    await notebooks.importNotebook(metadata('history'), [
      {
        notebookId: 'history',
        filePath: 'a',
        fileName: 'a',
        content: 'edited',
        size: 6,
        lastModified: 'now',
      },
    ]);
    await notebooks.saveNotebook(metadata('unrelated'));
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('easyremote-file-cache', 1);
      open.onupgradeneeded = () =>
        open.result
          .createObjectStore('files', { keyPath: 'id' })
          .put({ id: 'a', notebookId: 'history', path: 'a', name: 'a', content: 'old', size: 3 });
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
    });
    const needed = await DataMigration.isMigrationNeeded();
    const stats = await DataMigration.forceMigration();
    const after = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    const body = await provider.get(DB_CONFIG.STORES.FILES_CONTENT, 'history::a');
    await provider.close();
    return { needed, stats, after, body };
  });
  expect(result.needed).toBe(true);
  expect(result.stats).toMatchObject({ notebooksMigrated: 0, filesMigrated: 0 });
  expect(result.stats.errors).toHaveLength(1);
  expect(result.stats.errors[0]).toContain('Destination file conflict');
  expect(result.after.map((book) => book.id).sort()).toEqual(['history', 'unrelated']);
  expect(result.body.content).toBe('edited');
});

test('historical validation rejects damaged notebook batches without inventing empty content', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { DataMigration, LegacyDatabaseReader, IndexedDBStorageProvider, DB_CONFIG } =
      window.storageHarness;
    const records = [
      { id: 'missing', notebookId: 'damaged', path: 'missing', name: 'missing' },
      { id: 'companion', notebookId: 'damaged', path: 'good', name: 'good', content: 'good' },
      { id: 'unicode', notebookId: 'valid', path: 'unicode', name: 'unicode', content: '你好' },
      {
        id: 'empty',
        notebookId: 'valid',
        path: 'empty',
        name: 'empty',
        content: '',
        cachedAt: 0,
        lastAccessed: 0,
      },
      { id: 'unidentified', content: 'unowned' },
    ];
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('easyremote-file-cache', 1);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore('files', { keyPath: 'id' });
        records.forEach((record) => store.add(record));
      };
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
    });
    const stats = await DataMigration.migrate();
    const provider = new IndexedDBStorageProvider();
    const notebooks = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    const bodies = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
    const original = await new LegacyDatabaseReader('easyremote-file-cache', 'files', 1000).run();
    await provider.close();
    return { stats, notebooks, bodies, original };
  });
  expect(result.stats).toMatchObject({
    filesFound: 5,
    notebooksFound: 2,
    notebooksMigrated: 1,
    filesMigrated: 2,
  });
  expect(result.stats.errors).toHaveLength(2);
  expect(result.stats.errors.join(' ')).toContain('Invalid content');
  expect(result.notebooks).toHaveLength(1);
  expect(result.notebooks[0]).toMatchObject({ id: 'valid', fileCount: 2, totalSize: 6 });
  expect(result.bodies.map((file) => file.content).sort()).toEqual(['', '你好']);
  expect(result.original.files).toHaveLength(5);
  expect(result.original.files.find((file) => file.id === 'missing').content).toBeUndefined();
});

test('matching historical files restore missing notebook ownership atomically without rewriting files', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, FileRepository, DB_CONFIG } =
      window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new NotebookRepository(provider);
    const S = DB_CONFIG.STORES;
    const incoming = {
      notebookId: 'orphan',
      filePath: 'a',
      fileName: 'a',
      content: 'one',
      size: 3,
      lastModified: 'old',
    };
    const files = new FileRepository(provider);
    await files.saveFile(incoming);
    await files.saveFile({ ...incoming, filePath: 'b', fileName: 'b', content: 'second', size: 6 });
    await provider.delete(S.NOTEBOOKS, 'orphan');
    const old = await provider.get(S.FILES_METADATA, 'orphan::b');
    await provider.put(S.FILES_METADATA, {
      ...old,
      accessCount: 19,
      lastAccessedAt: 9999999999999,
    });
    const before = await Promise.all([
      provider.getAll(S.FILES_METADATA),
      provider.getAll(S.FILES_CONTENT),
      provider.getAll(S.ACTIVITIES),
    ]);
    const notebook = {
      id: 'orphan',
      name: 'Restored',
      lastAccessedAt: 1,
      accessCount: 1,
      cacheEnabled: true,
    };
    const failing = new NotebookRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('restore aborted');
        }),
    });
    let abort;
    try {
      await failing.importNotebook(notebook, [incoming]);
    } catch (error) {
      abort = error.message;
    }
    const afterAbort = await provider.get(S.NOTEBOOKS, 'orphan');
    const recordsAfterAbort = await Promise.all([
      provider.getAll(S.FILES_METADATA),
      provider.getAll(S.FILES_CONTENT),
      provider.getAll(S.ACTIVITIES),
    ]);
    let conflict;
    try {
      await repository.importNotebook(notebook, [{ ...incoming, content: 'different' }]);
    } catch (error) {
      conflict = error.message;
    }
    const afterConflict = await provider.get(S.NOTEBOOKS, 'orphan');
    const imported = await repository.importNotebook(notebook, [incoming]);
    const restored = await provider.get(S.NOTEBOOKS, 'orphan');
    const repeat = await repository.importNotebook(notebook, [incoming]);
    const afterRepeat = await provider.get(S.NOTEBOOKS, 'orphan');
    const after = await Promise.all([
      provider.getAll(S.FILES_METADATA),
      provider.getAll(S.FILES_CONTENT),
      provider.getAll(S.ACTIVITIES),
    ]);
    const empty = await repository.importNotebook({ ...notebook, id: 'empty' }, []);
    const emptyParent = await provider.get(S.NOTEBOOKS, 'empty');
    await provider.close();
    return {
      before,
      abort,
      afterAbort,
      recordsAfterAbort,
      conflict,
      afterConflict,
      imported,
      restored,
      repeat,
      afterRepeat,
      after,
      empty,
      emptyParent,
    };
  });
  expect(result.abort).toBe('restore aborted');
  expect(result.afterAbort).toBeUndefined();
  expect(result.recordsAfterAbort).toEqual(result.before);
  expect(result.conflict).toContain('Destination file conflict');
  expect(result.afterConflict).toBeUndefined();
  expect(result.imported).toBe(0);
  expect(result.restored).toMatchObject({
    id: 'orphan',
    name: 'Restored',
    fileCount: 2,
    totalSize: 9,
    accessCount: 19,
    lastAccessedAt: 9999999999999,
    retention: 'persistent',
  });
  expect(result.repeat).toBe(0);
  expect(result.afterRepeat).toEqual(result.restored);
  expect(result.after.slice(0, 2)).toEqual(result.before.slice(0, 2));
  expect(result.after[2]).toHaveLength(result.before[2].length + 1);
  expect(result.empty).toBe(0);
  expect(result.emptyParent).toBeUndefined();
});

test('migration receipts and deletion tombstones commit atomically with notebook records', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IndexedDBStorageProvider, NotebookRepository, DB_CONFIG } = window.storageHarness;
    const provider = new IndexedDBStorageProvider();
    const repository = new NotebookRepository(provider);
    const S = DB_CONFIG.STORES;
    const notebook = {
      id: 'receipt',
      name: 'Receipt',
      lastAccessedAt: 1,
      accessCount: 1,
      cacheEnabled: true,
    };
    const file = {
      notebookId: 'receipt',
      filePath: 'a',
      fileName: 'a',
      content: 'body',
      size: 4,
      lastModified: 'old',
    };
    const failing = new NotebookRepository({
      transaction: (names, mode, schedule) =>
        provider.transaction(names, mode, async (stores) => {
          await schedule(stores);
          throw new Error('ledger abort');
        }),
    });
    let failedImport;
    try {
      await failing.importNotebook(notebook, [file], 'source-a');
    } catch (error) {
      failedImport = error.message;
    }
    const afterFailedImport = await Promise.all([
      provider.getAll(S.MIGRATION_LEDGER),
      provider.getAll(S.NOTEBOOKS),
      provider.getAll(S.FILES_CONTENT),
    ]);
    const imported = await repository.importNotebook(notebook, [file], 'source-a');
    const acknowledged = await repository.importNotebook(notebook, [file], 'source-b');
    const terminalRetry = await repository.importNotebook(
      notebook,
      [{ ...file, content: 'changed old source' }],
      'source-a'
    );
    const receipt = await provider.get(S.MIGRATION_LEDGER, 'receipt');
    let failedDeletion;
    try {
      await failing.deleteNotebook('receipt');
    } catch (error) {
      failedDeletion = error.message;
    }
    const afterFailedDeletion = await provider.get(S.MIGRATION_LEDGER, 'receipt');
    const retainedBody = await provider.get(S.FILES_CONTENT, 'receipt::a');
    await repository.deleteNotebook('receipt');
    const tombstone = await provider.get(S.MIGRATION_LEDGER, 'receipt');
    const repeatedSource = await repository.importNotebook(notebook, [file], 'source-a');
    const unseenSource = await repository.importNotebook(notebook, [file], 'source-c');
    const deleted = await Promise.all([
      provider.getAll(S.NOTEBOOKS),
      provider.getAll(S.FILES_CONTENT),
    ]);
    await provider.close();
    return {
      failedImport,
      afterFailedImport,
      imported,
      acknowledged,
      terminalRetry,
      receipt,
      failedDeletion,
      afterFailedDeletion,
      retainedBody,
      tombstone,
      repeatedSource,
      unseenSource,
      deleted,
    };
  });
  expect(result.failedImport).toBe('ledger abort');
  expect(result.afterFailedImport).toEqual([[], [], []]);
  expect(result.imported).toBe(1);
  expect(result.acknowledged).toBe(0);
  expect(result.terminalRetry).toBe(0);
  expect(result.receipt).toMatchObject({ state: 'imported', sources: ['source-a', 'source-b'] });
  expect(result.failedDeletion).toBe('ledger abort');
  expect(result.afterFailedDeletion).toEqual(result.receipt);
  expect(result.retainedBody.content).toBe('body');
  expect(result.tombstone).toMatchObject({ state: 'deleted', sources: ['source-a', 'source-b'] });
  expect(result.repeatedSource).toBe(0);
  expect(result.unseenSource).toBe(0);
  expect(result.deleted).toEqual([[], []]);
});

test('deleted migrated notebooks stay deleted after reload and forced historical retry', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { DataMigration, IndexedDBStorageProvider, NotebookRepository } = window.storageHarness;
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('easyremote-file-cache', 1);
      open.onupgradeneeded = () =>
        open.result
          .createObjectStore('files', { keyPath: 'id' })
          .add({ id: 'a', notebookId: 'history', path: 'a', name: 'a', content: 'old' });
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
    });
    const stats = await DataMigration.migrate();
    if (stats.filesMigrated !== 1) throw new Error('Initial migration failed');
    const provider = new IndexedDBStorageProvider();
    await new NotebookRepository(provider).deleteNotebook('history');
    await provider.close();
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.storageHarness));
  const result = await page.evaluate(async () => {
    const { DataMigration, IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const stats = await DataMigration.forceMigration();
    const provider = new IndexedDBStorageProvider();
    const notebooks = await provider.getAll(DB_CONFIG.STORES.NOTEBOOKS);
    const files = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
    const ledger = await provider.get(DB_CONFIG.STORES.MIGRATION_LEDGER, 'history');
    await provider.close();
    return { stats, notebooks, files, ledger };
  });
  expect(result.stats).toMatchObject({ notebooksMigrated: 0, filesMigrated: 0, errors: [] });
  expect(result.notebooks).toEqual([]);
  expect(result.files).toEqual([]);
  expect(result.ledger.state).toBe('deleted');
});
