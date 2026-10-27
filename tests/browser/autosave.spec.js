import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/storage.html');
  await page.waitForFunction(() => Boolean(window.storageHarness));
});

test('accepted autosave snapshot survives caller mutation and page reload', async ({ page }) => {
  await page.evaluate(async () => {
    const { AutoSaveService } = window.storageHarness;
    const service = AutoSaveService.getInstance({ debounceMs: 60000 });
    const snapshot = {
      notebookId: 'owned-snapshot',
      notebookTitle: 'Accepted',
      timestamp: Date.now(),
      tasks: [],
      cells: [
        {
          id: 'code',
          type: 'code',
          content: 'original',
          outputs: [{ type: 'text', content: 'original output' }],
          metadata: { label: 'original label' },
        },
      ],
    };
    await service.queueSave(snapshot);
    snapshot.cells[0].content = 'unaccepted edit';
    snapshot.cells[0].outputs[0].content = 'unaccepted output';
    snapshot.cells[0].metadata.label = 'unaccepted label';
    snapshot.cells.push({ id: 'late', type: 'markdown', content: 'late' });
    await service.flush();
    await service.dispose();
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.storageHarness));
  const restored = await page.evaluate(async () => {
    const service = window.storageHarness.AutoSaveService.getInstance();
    const data = await service.load('owned-snapshot');
    await service.dispose();
    return data;
  });
  expect(restored).toMatchObject({
    notebookTitle: 'Accepted',
    cells: [
      {
        id: 'code',
        content: 'original',
        outputs: [{ type: 'text', content: 'original output' }],
        metadata: { label: 'original label' },
      },
    ],
  });
  expect(restored.cells).toHaveLength(1);
});

test('uncloneable pause input does not start a native drain or replace accepted work', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { AutoSaveService, IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const service = AutoSaveService.getInstance({ debounceMs: 60000 });
    const input = {
      notebookId: 'pause-owner',
      notebookTitle: 'Accepted',
      timestamp: Date.now(),
      tasks: [],
      cells: [{ id: 'cell', type: 'markdown', content: 'accepted' }],
    };
    await service.queueSave(input);
    const revision = service.getSaveProgress(input.notebookId).currentRevision;
    let error;
    try {
      await service.pause({
        ...input,
        cells: [{ ...input.cells[0], metadata: { callback() {} } }],
      });
    } catch (failure) {
      error = failure.name;
    }
    await service.waitForComplete();
    const state = service.getState();
    const progress = service.getSaveProgress(input.notebookId);
    const provider = new IndexedDBStorageProvider();
    const before = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
    await service.pause();
    const after = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
    await service.dispose();
    await provider.close();
    return {
      error,
      state,
      progress,
      revision,
      before,
      after: after.map((record) => JSON.parse(record.content)),
    };
  });
  expect(result.error).toBe('DataCloneError');
  expect(result.state).toMatchObject({ scheduling: 'running', isDirty: true });
  expect(result.progress).toMatchObject({
    phase: 'scheduled',
    currentRevision: result.revision,
    committedRevision: 0,
  });
  expect(result.before).toEqual([]);
  expect(result.after).toHaveLength(1);
  expect(result.after[0].cells[0].content).toBe('accepted');
});

test('native transaction abort retries the same accepted body despite caller mutation', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { AutoSaveService, IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
    const service = AutoSaveService.getInstance({
      debounceMs: 60000,
      maxRetries: 1,
      retryDelayMs: 0,
    });
    const input = {
      notebookId: 'retry-owner',
      notebookTitle: 'Accepted',
      timestamp: Date.now(),
      tasks: [],
      cells: [{ id: 'cell', type: 'markdown', content: 'accepted' }],
    };
    const original = IDBObjectStore.prototype.put;
    const bodies = [];
    const failures = [];
    const stop = service.subscribe((event) => {
      if (event.type === 'save_failed') failures.push(event.progress.phase);
    });
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === DB_CONFIG.STORES.FILES_CONTENT) {
        bodies.push(args[0].content);
        if (bodies.length === 1)
          request.addEventListener(
            'success',
            () => {
              input.cells[0].content = 'unaccepted retry edit';
              this.transaction.abort();
            },
            { once: true }
          );
      }
      return request;
    };
    try {
      await service.saveNow(input);
      const progress = service.getSaveProgress(input.notebookId);
      const provider = new IndexedDBStorageProvider();
      const records = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
      const notebook = await provider.get(DB_CONFIG.STORES.NOTEBOOKS, input.notebookId);
      await provider.close();
      return {
        bodies,
        failures,
        progress,
        records: records.map((record) => JSON.parse(record.content)),
        fileCount: notebook.fileCount,
      };
    } finally {
      IDBObjectStore.prototype.put = original;
      stop();
      await AutoSaveService.resetInstance();
    }
  });
  expect(result.bodies).toHaveLength(2);
  expect(result.bodies[1]).toBe(result.bodies[0]);
  expect(result.failures).toEqual(['retry_wait']);
  expect(result.progress).toMatchObject({ phase: 'clean', inFlightRevision: null });
  expect(result.progress.committedRevision).toBe(result.progress.currentRevision);
  expect(result.records).toHaveLength(1);
  expect(result.records[0].cells[0].content).toBe('accepted');
  expect(result.fileCount).toBe(1);
});

test('a failed scoped transaction does not strand other notebooks or automatically retry blocked work', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { AutoSaveService, DB_CONFIG } = window.storageHarness;
    const service = AutoSaveService.getInstance({ debounceMs: 10, maxRetries: 0 });
    await service.initialize();
    const original = IDBObjectStore.prototype.put;
    const probe = { service, original, attempts: [], abortA: true, failed: false };
    window.autosaveScheduling = probe;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === DB_CONFIG.STORES.FILES_CONTENT) {
        const body = JSON.parse(args[0].content);
        probe.attempts.push(body.notebook_id);
        if (body.notebook_id === 'a' && probe.abortA)
          request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    };
    const snapshot = (id) => ({
      notebookId: id,
      notebookTitle: id,
      timestamp: Date.now(),
      tasks: [],
      cells: [{ id: 'cell', type: 'markdown', content: `accepted ${id}` }],
    });
    await service.queueSave(snapshot('a'));
    await service.queueSave(snapshot('b'));
    try {
      await service.flush('a');
    } catch {
      probe.failed = true;
    }
  });
  try {
    await expect
      .poll(() =>
        page.evaluate(() => window.autosaveScheduling.service.getSaveProgress('b')?.phase)
      )
      .toBe('clean');
    expect(
      await page.evaluate(() => ({
        failed: window.autosaveScheduling.failed,
        attempts: window.autosaveScheduling.attempts,
        phase: window.autosaveScheduling.service.getSaveProgress('a')?.phase,
      }))
    ).toEqual({ failed: true, attempts: ['a', 'b'], phase: 'blocked' });
    await page.evaluate(async () => {
      await window.autosaveScheduling.service.queueSave({
        notebookId: 'c',
        notebookTitle: 'c',
        timestamp: Date.now(),
        tasks: [],
        cells: [{ id: 'cell', type: 'markdown', content: 'accepted c' }],
      });
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.autosaveScheduling.service.getSaveProgress('c')?.phase)
      )
      .toBe('clean');
    const beforeRetry = await page.evaluate(async () => {
      const { IndexedDBStorageProvider, DB_CONFIG } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      try {
        const records = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
        return {
          attempts: window.autosaveScheduling.attempts,
          persisted: records.map((record) => JSON.parse(record.content).notebook_id).sort(),
          failedNotebook: await provider.get(DB_CONFIG.STORES.NOTEBOOKS, 'a'),
        };
      } finally {
        await provider.close();
      }
    });
    expect(beforeRetry.attempts).toEqual(['a', 'b', 'c']);
    expect(beforeRetry.persisted).toEqual(['b', 'c']);
    expect(beforeRetry.failedNotebook).toBeUndefined();
    await page.evaluate(async () => {
      try {
        await window.autosaveScheduling.service.flush('a');
      } catch {
        /* expected native abort */
      }
    });
    expect(await page.evaluate(() => window.autosaveScheduling.attempts)).toEqual([
      'a',
      'b',
      'c',
      'a',
    ]);
    await page.evaluate(async () => {
      const probe = window.autosaveScheduling;
      probe.abortA = false;
      await probe.service.queueSave({
        notebookId: 'a',
        notebookTitle: 'corrected',
        timestamp: Date.now(),
        tasks: [],
        cells: [{ id: 'cell', type: 'markdown', content: 'corrected a' }],
      });
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.autosaveScheduling.service.getSaveProgress('a')?.phase)
      )
      .toBe('clean');
    const restored = await page.evaluate(async () => {
      const service = window.autosaveScheduling.service;
      return { pending: service.hasPending(), notebook: await service.load('a') };
    });
    expect(restored.pending).toBe(false);
    expect(restored.notebook.cells[0].content).toBe('corrected a');
  } finally {
    await page.evaluate(async () => {
      IDBObjectStore.prototype.put = window.autosaveScheduling.original;
      await window.storageHarness.AutoSaveService.resetInstance();
      delete window.autosaveScheduling;
    });
  }
});

for (const failLatest of [false, true]) {
  test(`native recovery catch-up ${failLatest ? 'retains pending edits after a later abort' : 'persists edits accepted before transaction completion'}`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (abortLatest) => {
      const {
        AutoSaveService,
        IndexedDBStorageProvider,
        NotebookRepository,
        NotebookRecoveryRepository,
        DB_CONFIG,
      } = window.storageHarness;
      const provider = new IndexedDBStorageProvider();
      const notebooks = new NotebookRepository(provider);
      const recovery = new NotebookRecoveryRepository(provider);
      const id = 'recovery-catchup';
      const canonical = JSON.stringify({
        title: 'Winner',
        cells: [{ id: 'cell', type: 'markdown', content: 'winner' }],
        tasks: [],
      });
      await notebooks.saveNotebookSnapshot(
        {
          notebookId: id,
          filePath: `notebook_${id}.json`,
          fileName: 'Winner',
          content: canonical,
          size: canonical.length,
          lastModified: 'now',
        },
        { id, name: 'Winner', lastAccessedAt: 1, accessCount: 1, cacheEnabled: true }
      );
      const service = AutoSaveService.getInstance({ debounceMs: 60000, maxRetries: 0 });
      const snapshot = (content) => ({
        notebookId: id,
        notebookTitle: 'Local',
        timestamp: Date.now(),
        tasks: [],
        cells: [{ id: 'cell', type: 'markdown', content }],
      });
      const original = IDBObjectStore.prototype.put;
      const revisions = [];
      let admitted;
      IDBObjectStore.prototype.put = function (...args) {
        const request = original.apply(this, args);
        if (this.name === DB_CONFIG.STORES.NOTEBOOK_RECOVERY) {
          revisions.push(args[0].revision);
          const index = revisions.length;
          request.addEventListener(
            'success',
            () => {
              if (index === 1) admitted = service.queueSave(snapshot('latest'));
              else if (abortLatest) this.transaction.abort();
            },
            { once: true }
          );
        }
        return request;
      };
      let error;
      try {
        try {
          await service.saveNow(snapshot('first'));
        } catch (failure) {
          error = failure.message;
        }
        await admitted;
        const drafts = await recovery.listDrafts(id);
        const stored = await provider.getAll(DB_CONFIG.STORES.FILES_CONTENT);
        return {
          error,
          revisions,
          progress: service.getSaveProgress(id),
          pending: service.hasPending(id),
          drafts: drafts.map((draft) => ({
            revision: draft.revision,
            text: JSON.parse(draft.content).cells[0].content,
          })),
          canonical: stored.map((record) => record.content),
        };
      } finally {
        IDBObjectStore.prototype.put = original;
        await AutoSaveService.resetInstance();
        await provider.close();
      }
    }, failLatest);
    expect(result.revisions).toEqual([1, 2]);
    expect(result.drafts).toEqual([
      { revision: failLatest ? 1 : 2, text: failLatest ? 'first' : 'latest' },
    ]);
    expect(result.progress).toMatchObject({
      phase: 'blocked',
      currentRevision: 2,
      committedRevision: 0,
    });
    expect(result.pending).toBe(true);
    expect(result.canonical).toHaveLength(1);
    expect(JSON.parse(result.canonical[0]).cells[0].content).toBe('winner');
    expect(result.error).toContain('content changed');
    if (failLatest) expect(result.error).toContain('recovery could not be saved');
  });
}
