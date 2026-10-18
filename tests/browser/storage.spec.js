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
