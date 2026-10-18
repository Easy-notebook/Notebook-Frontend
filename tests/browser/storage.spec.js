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

for (const entryPoint of ['provider', 'manager']) {
  test(`v2 upgrade through ${entryPoint} preserves records and reconciles missing schema`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (entryPoint) => {
      const { DB_CONFIG, IndexedDBStorageProvider, IndexedDBManager } = window.storageHarness;
      const original = await new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_CONFIG.NAME, 2);
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
      if (entryPoint === 'provider') {
        const provider = new IndexedDBStorageProvider();
        await provider.initialize();
        await provider.close();
      } else {
        await IndexedDBManager.initialize();
        IndexedDBManager.close();
      }
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
    }, entryPoint);
    expect(result.version).toBe(3);
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
