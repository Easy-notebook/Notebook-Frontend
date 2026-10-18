import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSaveService } from './AutoSaveService';
import { createAutoSaveStore } from './autoSaveStore';
import { AutoSaveStatus, type AutoSaveEvent, type NotebookSnapshot } from './types';

const storage = vi.hoisted(() => ({
  initialize: vi.fn(),
  close: vi.fn(),
  notebooks: { saveNotebookSnapshot: vi.fn(), getNotebook: vi.fn() },
  files: { getFile: vi.fn() },
}));
vi.mock('../persistence/PersistenceService', () => ({
  PersistenceService: class {
    initialize = storage.initialize;
    close = storage.close;
    notebooks = storage.notebooks;
    files = storage.files;
  },
}));
function snapshot(title: string, notebookId = 'a'): NotebookSnapshot {
  return {
    notebookId,
    notebookTitle: title,
    cells: [{ id: 'title', type: 'markdown', content: title }],
    tasks: [],
    timestamp: Date.now(),
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let service: AutoSaveService;
let binding: ReturnType<typeof createAutoSaveStore>;
beforeEach(async () => {
  await AutoSaveService.resetInstance();
  vi.resetAllMocks();
  storage.initialize.mockResolvedValue(undefined);
  storage.close.mockResolvedValue(undefined);
  storage.notebooks.saveNotebookSnapshot.mockResolvedValue({ id: 'saved' });
  storage.files.getFile.mockResolvedValue(null);
  storage.notebooks.getNotebook.mockResolvedValue(null);
  service = AutoSaveService.getInstance({ debounceMs: 60000, maxRetries: 0 });
  binding = createAutoSaveStore(service);
});
afterEach(async () => {
  binding.unsubscribe();
  await AutoSaveService.resetInstance();
});

describe('authoritative autosave projection', () => {
  it('publishes initialization failure through the same authoritative state', async () => {
    storage.initialize.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(binding.store.getState().initialize()).rejects.toThrow('storage unavailable');
    expect(binding.store.getState().error).toBe('storage unavailable');
    expect(service.getState().error).toBe('storage unavailable');
    await service.saveNow(snapshot('retry'));
    expect(binding.store.getState()).toMatchObject({ error: null, isDirty: false });
  });

  it('never publishes clean while a newer edit is waiting for its commit', async () => {
    const first = deferred();
    const firstStarted = deferred();
    const second = deferred();
    const secondStarted = deferred();
    storage.notebooks.saveNotebookSnapshot
      .mockImplementationOnce(async () => {
        firstStarted.resolve();
        await first.promise;
        return { id: 'one' };
      })
      .mockImplementationOnce(async () => {
        secondStarted.resolve();
        await second.promise;
        return { id: 'two' };
      });
    const events: AutoSaveEvent[] = [];
    service.subscribe((event) => events.push(event));
    const saving = service.saveNow(snapshot('first'));
    await firstStarted.promise;
    await service.queueSave(snapshot('second'));
    const dirtyStates: boolean[] = [];
    const unsubscribe = binding.store.subscribe((state) => dirtyStates.push(state.isDirty));
    first.resolve();
    await secondStarted.promise;
    expect(dirtyStates).not.toContain(false);
    expect(binding.store.getState().pendingCount).toBe(1);
    const firstCommit = events.find((event) => event.type === 'save_completed')!;
    expect(firstCommit.state.isDirty).toBe(true);
    expect(firstCommit.revision).toBe(1);
    second.resolve();
    await saving;
    await service.flushThrough('a', 2);
    expect(binding.store.getState().isDirty).toBe(false);
    expect(binding.store.getState().pendingCount).toBe(0);
    expect(
      events.filter((event) => event.type === 'save_completed').map((event) => event.revision)
    ).toEqual([1, 2]);
    expect(firstCommit.state.isDirty).toBe(true);
    expect(Object.isFrozen(firstCommit.state)).toBe(true);
    unsubscribe();
  });

  it('loading another notebook does not erase queued edits', async () => {
    await service.queueSave(snapshot('pending', 'a'));
    await binding.store.getState().load('b');
    expect(binding.store.getState()).toMatchObject({ isDirty: true, pendingCount: 1 });
    await service.flush();
    expect(binding.store.getState()).toMatchObject({ isDirty: false, pendingCount: 0 });
  });

  it('clears only the selected notebook and initializes late subscribers from actual state', async () => {
    await service.queueSave(snapshot('a', 'a'));
    await service.queueSave(snapshot('b', 'b'));
    binding.unsubscribe();
    binding = createAutoSaveStore(service);
    expect(binding.store.getState().pendingCount).toBe(2);
    binding.store.getState().clearPending('a');
    expect(binding.store.getState()).toMatchObject({ isDirty: true, pendingCount: 1 });
    binding.store.getState().clearPending('b');
    expect(binding.store.getState()).toMatchObject({ isDirty: false, pendingCount: 0 });
  });

  it('retains failed edits and clears the error in the service and every projection', async () => {
    storage.notebooks.saveNotebookSnapshot.mockRejectedValue(new Error('quota'));
    await expect(binding.store.getState().saveNow(snapshot('edit'))).rejects.toThrow('quota');
    expect(binding.store.getState()).toMatchObject({
      isDirty: true,
      pendingCount: 1,
      error: 'quota',
    });
    binding.store.getState().clearError();
    expect(service.getState()).toMatchObject({ isDirty: true, error: null });
    expect(binding.store.getState()).toMatchObject({ isDirty: true, error: null });
  });

  it('publishes paused state only with its complete cleared session metadata', async () => {
    await service.queueSave(snapshot('edit'));
    const disconnected: AutoSaveEvent[] = [];
    service.subscribe((event) => {
      if (event.status === AutoSaveStatus.DISCONNECTED) disconnected.push(event);
    });
    await binding.store.getState().pause();
    expect(disconnected.length).toBeGreaterThan(0);
    for (const event of disconnected) {
      expect(event.state).toMatchObject({
        scheduling: 'paused',
        activeNotebookId: null,
        isDirty: false,
        pendingCount: 0,
      });
    }
    expect(binding.store.getState()).toMatchObject(disconnected[0].state);
  });

  it('delivers a reentrant edit after the current transition to every observer', async () => {
    binding.unsubscribe();
    service.subscribe((event) => {
      if (event.type === 'save_completed') void service.queueSave(snapshot('follow-up', 'b'));
    });
    binding = createAutoSaveStore(service);
    await service.saveNow(snapshot('first', 'a'));
    expect(binding.store.getState()).toMatchObject({
      activeNotebookId: 'b',
      isDirty: true,
      pendingCount: 1,
    });
    expect(service.hasPending('b')).toBe(true);
  });
});
