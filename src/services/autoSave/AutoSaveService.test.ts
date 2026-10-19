import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotebookConflictError } from '../persistence/NotebookConflictError';
import { AutoSaveService } from './AutoSaveService';
import { AutoSaveStatus, type NotebookSnapshot } from './types';

const storage = vi.hoisted(() => ({
  recovery: { saveDraft: vi.fn() },
  initialize: vi.fn(),
  close: vi.fn(),
  notebooks: { saveNotebook: vi.fn(), saveNotebookSnapshot: vi.fn(), getNotebook: vi.fn() },
  files: { saveFile: vi.fn(), getFile: vi.fn(), getFilesForNotebook: vi.fn() },
}));
vi.mock('../persistence/PersistenceService', () => ({
  PersistenceService: class {
    recovery = storage.recovery;
    initialize = storage.initialize;
    close = storage.close;
    notebooks = storage.notebooks;
    files = storage.files;
  },
}));

function snapshot(text: string, notebookId = 'notebook'): NotebookSnapshot {
  return {
    notebookId,
    notebookTitle: text,
    timestamp: Date.now(),
    tasks: [],
    cells: [{ id: 'title', type: 'markdown', content: `# ${text}`, outputs: [] }],
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let service: AutoSaveService;
beforeEach(() => {
  vi.resetAllMocks();
  storage.initialize.mockResolvedValue(undefined);
  storage.close.mockResolvedValue(undefined);
  storage.notebooks.saveNotebook.mockResolvedValue({});
  storage.notebooks.saveNotebookSnapshot.mockResolvedValue({ id: 'file', hasLocalContent: true });
  storage.files.getFilesForNotebook.mockResolvedValue([]);
  service = AutoSaveService.getInstance({ debounceMs: 60000, maxRetries: 1, retryDelayMs: 0 });
});
afterEach(() => AutoSaveService.resetInstance());

describe('single-writer autosave', () => {
  it('gives another notebook a turn before consuming continuous edits to the first', async () => {
    const writes: string[] = [];
    let edits = 0;
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
      writes.push(file.notebookId);
      return { id: 'saved' };
    });
    service.subscribe((event) => {
      if (event.type === 'save_completed' && event.notebookId === 'a' && edits++ < 3)
        void service.queueSave(snapshot(`edit ${edits}`, 'a'));
    });
    await service.queueSave(snapshot('first', 'a'));
    await service.queueSave(snapshot('second', 'b'));
    await service.flush();
    expect(writes).toEqual(['a', 'b', 'a', 'a', 'a']);
    expect(service.hasPending()).toBe(false);
  });

  it('keeps retry budgets per notebook while rotating write attempts', async () => {
    const writes: string[] = [];
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
      writes.push(file.notebookId);
      if (file.notebookId === 'a') throw new Error('quota');
      return { id: 'saved' };
    });
    await service.queueSave(snapshot('first', 'a'));
    await service.queueSave(snapshot('second', 'b'));
    await expect(service.flush()).rejects.toThrow('quota');
    expect(writes).toEqual(['a', 'b', 'a']);
    expect(service.getSaveProgress('a')?.phase).toBe('blocked');
    expect(service.getSaveProgress('b')?.phase).toBe('clean');
  });

  it('includes a newly queued notebook in the next round', async () => {
    const writes: string[] = [];
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
      writes.push(file.notebookId);
      return { id: 'saved' };
    });
    let added = false;
    service.subscribe((event) => {
      if (event.type === 'save_completed' && !added) {
        added = true;
        void service.queueSave(snapshot('new notebook', 'b'));
        void service.queueSave(snapshot('new edit', 'a'));
      }
    });
    await service.queueSave(snapshot('first', 'a'));
    await service.flush();
    expect(writes).toEqual(['a', 'b', 'a']);
  });

  it('admits debounced work while another notebook is waiting to retry', async () => {
    await AutoSaveService.resetInstance();
    service = AutoSaveService.getInstance({ debounceMs: 10, maxRetries: 1, retryDelayMs: 1000 });
    vi.useFakeTimers();
    try {
      storage.notebooks.saveNotebookSnapshot.mockRejectedValueOnce(new Error('temporary'));
      const saving = service.saveNow(snapshot('first', 'a'));
      await vi.advanceTimersByTimeAsync(0);
      await service.queueSave(snapshot('second', 'b'));
      await vi.advanceTimersByTimeAsync(10);
      expect(
        storage.notebooks.saveNotebookSnapshot.mock.calls.map(([file]) => file.notebookId)
      ).toEqual(['a', 'b']);
      expect(service.getSaveProgress('a')?.phase).toBe('retry_wait');
      expect(service.getSaveProgress('b')?.phase).toBe('clean');
      await vi.advanceTimersByTimeAsync(990);
      await saving;
      await service.waitForComplete();
      expect(service.hasPending()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not make a read of another notebook wait for an unrelated retry', async () => {
    await AutoSaveService.resetInstance();
    service = AutoSaveService.getInstance({ debounceMs: 60000, maxRetries: 1, retryDelayMs: 1000 });
    vi.useFakeTimers();
    try {
      storage.notebooks.saveNotebookSnapshot.mockRejectedValueOnce(new Error('temporary'));
      storage.files.getFile.mockResolvedValue(null);
      const saving = service.saveNow(snapshot('first', 'a'));
      await vi.advanceTimersByTimeAsync(0);
      await expect(service.load('b')).resolves.toBeNull();
      expect(service.getSaveProgress('a')?.phase).toBe('retry_wait');
      await vi.advanceTimersByTimeAsync(1000);
      await saving;
    } finally {
      vi.useRealTimers();
    }
  });

  it('acknowledges an immediate save without waiting for edits accepted during its write', async () => {
    const old = deferred();
    const next = deferred();
    storage.notebooks.saveNotebookSnapshot
      .mockImplementationOnce(async () => {
        await old.promise;
        return { id: 'old' };
      })
      .mockImplementationOnce(async () => {
        await next.promise;
        return { id: 'next' };
      });
    const saving = service.saveNow(snapshot('first'));
    await vi.waitFor(() => expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1));
    await service.queueSave(snapshot('second'));
    const revision = service.getSaveProgress('notebook')!.currentRevision;
    old.resolve();
    await saving;
    expect(service.getSaveProgress('notebook')).toMatchObject({
      committedRevision: 1,
      currentRevision: 2,
    });
    expect(service.hasPending('notebook')).toBe(true);
    const complete = service.flushThrough('notebook', revision);
    next.resolve();
    await complete;
    expect(service.getSaveProgress('notebook')).toMatchObject({
      phase: 'clean',
      committedRevision: revision,
    });
  });

  it('keeps failed notebook progress after another notebook successfully commits', async () => {
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
      if (file.notebookId === 'bad') throw new Error('quota');
      return { id: 'saved' };
    });
    await service.queueSave(snapshot('bad', 'bad'));
    await service.queueSave(snapshot('good', 'good'));
    await expect(service.flush()).rejects.toThrow('quota');
    expect(service.getSaveProgress('bad')).toMatchObject({
      phase: 'blocked',
      committedRevision: 0,
      error: 'quota',
    });
    expect(service.getSaveProgress('good')).toMatchObject({ phase: 'clean', error: null });
  });

  it('rejects impossible revision barriers without starting a write', async () => {
    await service.queueSave(snapshot('pending'));
    await expect(service.flushThrough('notebook', 100)).rejects.toThrow('Unknown');
    await expect(service.flushThrough('missing', 1)).rejects.toThrow('Unknown');
    expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
  });

  it('measures the complete serialized snapshot after in-place content edits', async () => {
    const data = snapshot('size');
    data.cells[0].content = '中文 🐍';
    await service.saveNow(data);
    data.cells[0].content = 'changed';
    await service.saveNow(data);
    const calls = storage.notebooks.saveNotebookSnapshot.mock.calls;
    expect(JSON.parse(calls[0][0].content).cells[0].content).toBe('中文 🐍');
    expect(JSON.parse(calls[1][0].content).cells[0].content).toBe('changed');
    for (const [file, metadata] of calls) {
      expect(file.size).toBe(new Blob([file.content]).size);
      expect(metadata).not.toHaveProperty('fileCount');
      expect(metadata).not.toHaveProperty('totalSize');
    }
  });
  it.each(['', undefined, null])(
    'does not treat an existing file with unavailable content %j as missing',
    async (content) => {
      storage.files.getFile.mockResolvedValue({ content });
      storage.notebooks.getNotebook.mockResolvedValue({ name: 'Existing notebook' });
      await expect(service.load('notebook')).rejects.toThrow();
      await expect(service.saveNow({ ...snapshot('empty'), cells: [] })).rejects.toThrow();
      expect(storage.notebooks.getNotebook).not.toHaveBeenCalled();
      expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
      expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
      expect(service.hasPending('notebook')).toBe(true);
    }
  );
  it('loads metadata for a genuinely absent content file', async () => {
    storage.files.getFile.mockResolvedValue(null);
    storage.notebooks.getNotebook.mockResolvedValue({ name: 'New notebook' });
    await expect(service.load('notebook')).resolves.toEqual({
      notebookTitle: 'New notebook',
      cells: [],
      tasks: [],
    });
  });
  it('prepares serializable content before writing notebook metadata', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const invalid = snapshot('invalid');
    invalid.cells[0].metadata = circular;
    await expect(service.saveNow(invalid)).rejects.toThrow();
    expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
    expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
    expect(service.hasPending('notebook')).toBe(true);
  });
  it.each([{}, [], { cells: null }, { cells: {} }, { cells: [], tasks: {} }])(
    'does not interpret an invalid stored structure as an empty notebook: %j',
    async (data) => {
      storage.files.getFile.mockResolvedValue({ content: JSON.stringify(data) });
      await expect(service.load('notebook')).rejects.toThrow('Invalid notebook data structure');
      await expect(service.saveNow({ ...snapshot('empty'), cells: [] })).rejects.toThrow(
        'Invalid notebook data structure'
      );
      expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
      expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
      expect(service.hasPending('notebook')).toBe(true);
    }
  );
  it('loads an explicitly empty cells array without inventing missing tasks', async () => {
    storage.files.getFile.mockResolvedValue({
      content: JSON.stringify({ title: 'Empty', cells: [] }),
    });
    await expect(service.load('notebook')).resolves.toEqual({
      notebookTitle: 'Empty',
      cells: [],
      tasks: [],
    });
  });
  it('retains an empty save without writing when existing content cannot be read', async () => {
    storage.files.getFile.mockRejectedValue(new Error('read unavailable'));
    await expect(service.saveNow({ ...snapshot('empty'), cells: [] })).rejects.toThrow(
      'read unavailable'
    );
    expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
    expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
    expect(service.hasPending('notebook')).toBe(true);
    expect(service.getState().isDirty).toBe(true);
    storage.files.getFile.mockResolvedValue({ content: JSON.stringify({ cells: [], tasks: [] }) });
    await service.flush();
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    expect(service.hasPending('notebook')).toBe(false);
  });

  it('does not replace a corrupt stored notebook with an empty snapshot', async () => {
    storage.files.getFile.mockResolvedValue({ content: '{broken json' });
    await expect(service.saveNow({ ...snapshot('empty'), cells: [] })).rejects.toThrow();
    expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
    expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
    expect(service.hasPending('notebook')).toBe(true);
  });

  it('reports corrupt stored content as a load failure rather than an empty notebook', async () => {
    storage.files.getFile.mockResolvedValue({ content: '{broken json' });
    const events: string[] = [];
    service.subscribe((event) => events.push(event.type));
    await expect(service.load('notebook')).rejects.toThrow();
    expect(events).toContain('load_failed');
    expect(events).not.toContain('load_completed');
    expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
  });
  it('coalesces queued edits and forces local persistence', async () => {
    await service.queueSave(snapshot('old'));
    await service.queueSave(snapshot('new'));
    await service.flush();
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.notebooks.saveNotebookSnapshot.mock.calls[0][0].content).title).toBe(
      'new'
    );
    expect(storage.notebooks.saveNotebookSnapshot.mock.calls[0][1]).toMatchObject({
      id: 'notebook',
      name: 'new',
    });
    expect(storage.files.saveFile).not.toHaveBeenCalled();
    expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
    expect(service.getState().isDirty).toBe(false);
  });

  it('serializes immediate saves behind an in-flight revision', async () => {
    const gate = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
      await gate.promise;
      return { id: 'old' };
    });
    const first = service.saveNow(snapshot('old'));
    await vi.waitFor(() => expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1));
    const second = service.saveNow(snapshot('new'));
    expect(service.getState().isDirty).toBe(true);
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(
      storage.notebooks.saveNotebookSnapshot.mock.calls.map(
        ([file]) => JSON.parse(file.content).title
      )
    ).toEqual(['old', 'new']);
    expect(service.hasPending()).toBe(false);
  });

  it('retries transient errors without losing the snapshot', async () => {
    storage.notebooks.saveNotebookSnapshot.mockRejectedValueOnce(new Error('temporary'));
    await service.saveNow(snapshot('keep'));
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(2);
    expect(service.getState().isDirty).toBe(false);
  });

  it('replaces a failed in-flight revision with the latest edit without retrying stale content', async () => {
    const gate = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('old revision failed');
    });
    const saving = service.saveNow(snapshot('old'));
    await vi.waitFor(() => expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1));
    await service.queueSave(snapshot('new'));
    gate.resolve();
    await saving;
    expect(
      storage.notebooks.saveNotebookSnapshot.mock.calls.map(
        ([file]) => JSON.parse(file.content).title
      )
    ).toEqual(['old', 'new']);
    expect(service.hasPending()).toBe(false);
    expect(service.getState()).toMatchObject({ isDirty: false, error: null });
  });

  it('recovers from an unserializable queued revision when a corrected edit arrives', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const invalid = snapshot('bad');
    invalid.cells[0].metadata = circular;
    await expect(service.saveNow(invalid)).rejects.toThrow();
    await service.saveNow(snapshot('corrected'));
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.notebooks.saveNotebookSnapshot.mock.calls[0][0].content).title).toBe(
      'corrected'
    );
    expect(service.getState()).toMatchObject({ isDirty: false, pendingCount: 0, error: null });
  });

  it('retains failed writes and refuses to report a successful pause', async () => {
    storage.notebooks.saveNotebookSnapshot.mockRejectedValue(new Error('disk full'));
    await expect(service.pause(snapshot('unsaved'))).rejects.toThrow('disk full');
    expect(service.hasPending('notebook')).toBe(true);
    expect(service.getState().isDirty).toBe(true);
    expect(service.getStatus()).not.toBe(AutoSaveStatus.DISCONNECTED);
    storage.notebooks.saveNotebookSnapshot.mockResolvedValue({ id: 'recovered' });
    await service.flush();
    expect(service.getState().isDirty).toBe(false);
  });

  it('continues saving other notebooks when one exhausts retries', async () => {
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
      if (file.notebookId === 'failed') throw new Error('failed notebook');
      return { id: 'saved' };
    });
    await service.queueSave(snapshot('bad', 'failed'));
    await service.queueSave(snapshot('good', 'healthy'));
    await expect(service.flush()).rejects.toThrow('failed notebook');
    expect(service.hasPending('failed')).toBe(true);
    expect(service.hasPending('healthy')).toBe(false);
  });

  it('does not propagate a different notebook writer failure to a waiting immediate save', async () => {
    const gate = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
      if (file.notebookId === 'failed') {
        await gate.promise;
        throw new Error('unavailable');
      }
      return { id: 'healthy' };
    });
    const first = service.saveNow(snapshot('bad', 'failed'));
    const failed = expect(first).rejects.toThrow('unavailable');
    await vi.waitFor(() => expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1));
    const second = service.saveNow(snapshot('good', 'healthy'));
    gate.resolve();
    await failed;
    await second;
    expect(service.hasPending('healthy')).toBe(false);
    expect(service.hasPending('failed')).toBe(true);
  });

  it('keeps later edits newer than a snapshot supplied to pause', async () => {
    const gate = deferred();
    storage.initialize.mockReturnValue(gate.promise);
    const paused = service.pause(snapshot('at navigation'));
    await service.queueSave(snapshot('later edit'));
    gate.resolve();
    await paused;
    const calls = storage.notebooks.saveNotebookSnapshot.mock.calls;
    expect(JSON.parse(calls[calls.length - 1][0].content).title).toBe('later edit');
    expect(service.isPaused()).toBe(true);
  });
});

describe('autosave shutdown ownership', () => {
  it('finishes an admitted save when an observer requests shutdown during enqueue', async () => {
    let shutdown: Promise<void> | undefined;
    service.subscribe((event) => {
      if (event.type === 'dirty_changed' && !shutdown) shutdown = service.dispose();
    });
    await service.saveNow(snapshot('accepted before shutdown'));
    await shutdown;
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    expect(service.getState().lifecycle).toBe('disposed');
  });

  it('flushes accepted edits, rejects new work, and waits for connection closure', async () => {
    const closing = deferred();
    const closeStarted = deferred();
    storage.close.mockImplementationOnce(async () => {
      closeStarted.resolve();
      await closing.promise;
    });
    await service.queueSave(snapshot('accepted'));
    const shutdown = service.dispose();
    expect(service.dispose()).toBe(shutdown);
    await expect(service.queueSave(snapshot('late'))).rejects.toThrow('closing');
    await expect(service.saveNow(snapshot('late'))).rejects.toThrow('closing');
    await expect(service.load('other')).rejects.toThrow('closing');
    await closeStarted.promise;
    expect(JSON.parse(storage.notebooks.saveNotebookSnapshot.mock.calls[0][0].content).title).toBe(
      'accepted'
    );
    expect(service.getState().lifecycle).toBe('closing');
    closing.resolve();
    await shutdown;
    expect(service.getState()).toMatchObject({
      lifecycle: 'disposed',
      isDirty: false,
      activeNotebookId: null,
    });
    expect(service.isInitialized()).toBe(false);
    await expect(service.initialize()).rejects.toThrow('disposed');
    expect(() => service.resume()).toThrow('disposed');
    await service.dispose();
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('drains both the in-flight and newer accepted revision before closing', async () => {
    const first = deferred();
    const started = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
      started.resolve();
      await first.promise;
      return { id: 'first' };
    });
    const saving = service.saveNow(snapshot('first'));
    await started.promise;
    await service.queueSave(snapshot('newer'));
    const shutdown = service.dispose();
    expect(storage.close).not.toHaveBeenCalled();
    first.resolve();
    await Promise.all([saving, shutdown]);
    expect(
      storage.notebooks.saveNotebookSnapshot.mock.calls.map(
        ([file]) => JSON.parse(file.content).title
      )
    ).toEqual(['first', 'newer']);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('retains data and restores admission after shutdown cannot save', async () => {
    storage.notebooks.saveNotebookSnapshot.mockRejectedValue(new Error('quota'));
    await service.queueSave(snapshot('retained'));
    await expect(service.dispose()).rejects.toThrow('quota');
    expect(service.getState()).toMatchObject({ lifecycle: 'active', isDirty: true });
    expect(service.getSaveProgress('notebook')?.phase).toBe('blocked');
    expect(storage.close).not.toHaveBeenCalled();
    storage.notebooks.saveNotebookSnapshot.mockResolvedValue({ id: 'retried' });
    await service.dispose();
    expect(service.getState().lifecycle).toBe('disposed');
  });

  it('waits for opening to settle before closing and never reactivates afterward', async () => {
    const opening = deferred();
    storage.initialize.mockReturnValueOnce(opening.promise);
    const initialized = service.initialize();
    const shutdown = service.dispose();
    await Promise.resolve();
    expect(storage.close).not.toHaveBeenCalled();
    opening.resolve();
    await Promise.all([initialized, shutdown]);
    expect(service.isInitialized()).toBe(false);
    expect(service.getState().lifecycle).toBe('disposed');
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('waits for an accepted load before publishing terminal state', async () => {
    const read = deferred();
    const started = deferred();
    storage.files.getFile.mockImplementationOnce(async () => {
      started.resolve();
      await read.promise;
      return null;
    });
    const loading = service.load('notebook');
    await started.promise;
    const events: string[] = [];
    service.subscribe((event) => events.push(`${event.type}:${event.state.lifecycle}`));
    const shutdown = service.dispose();
    await Promise.resolve();
    expect(storage.close).not.toHaveBeenCalled();
    read.resolve();
    await Promise.all([loading, shutdown]);
    expect(events[events.length - 1]).toBe('lifecycle_changed:disposed');
    expect(service.getState().status).toBe(AutoSaveStatus.DISCONNECTED);
  });

  it('allows retry when connection release fails', async () => {
    storage.close.mockRejectedValueOnce(new Error('close failed'));
    await expect(service.dispose()).rejects.toThrow('close failed');
    expect(service.getState()).toMatchObject({ lifecycle: 'active', error: 'close failed' });
    await service.dispose();
    expect(service.getState().lifecycle).toBe('disposed');
    expect(storage.close).toHaveBeenCalledTimes(2);
  });

  it('test reset explicitly discards queued work but waits for the in-flight write', async () => {
    const writing = deferred();
    const started = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
      started.resolve();
      await writing.promise;
      return { id: 'saved' };
    });
    const saving = service.saveNow(snapshot('in flight'));
    await started.promise;
    await service.queueSave(snapshot('discarded'));
    const reset = AutoSaveService.resetInstance();
    writing.resolve();
    await Promise.all([saving, reset]);
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    expect(service.getState().lifecycle).toBe('disposed');
    expect(AutoSaveService.getInstance()).not.toBe(service);
  });
});

describe('autosave pause admission', () => {
  it('restores scheduling when an overlapping pause and disposal both fail', async () => {
    const writing = deferred();
    const started = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementation(async () => {
      started.resolve();
      await writing.promise;
      throw new Error('quota');
    });
    const pausing = service.pause(snapshot('pending'));
    const pauseFailed = expect(pausing).rejects.toThrow('quota');
    await started.promise;
    const disposeFailed = expect(service.dispose()).rejects.toThrow('quota');
    writing.resolve();
    await Promise.all([pauseFailed, disposeFailed]);
    expect(service.getState()).toMatchObject({
      lifecycle: 'active',
      scheduling: 'running',
      isDirty: true,
    });
    storage.notebooks.saveNotebookSnapshot.mockResolvedValue({ id: 'recovered' });
    await service.queueSave(snapshot('new edit'));
    await service.flush();
  });

  it('saves a microtask edit arriving after the writer drained and before pause completes', async () => {
    let edit: Promise<void> | undefined;
    service.subscribe((event) => {
      if (event.type === 'save_completed' && event.revision === 1) {
        queueMicrotask(() => {
          edit = service.queueSave(snapshot('late accepted edit'));
        });
      }
    });
    await service.pause(snapshot('initial'));
    await edit;
    expect(
      storage.notebooks.saveNotebookSnapshot.mock.calls.map(
        ([file]) => JSON.parse(file.content).title
      )
    ).toEqual(['initial', 'late accepted edit']);
    expect(service.getState()).toMatchObject({ scheduling: 'paused', isDirty: false });
    expect(service.getSaveProgress('notebook')?.committedRevision).toBe(2);
  });

  it('does not resume automatic admission after a load or a manual save', async () => {
    await service.pause();
    await service.load('notebook');
    expect(service.isPaused()).toBe(true);
    await service.saveNow(snapshot('manual'));
    expect(service.isPaused()).toBe(true);
    await expect(service.queueSave(snapshot('not accepted'))).rejects.toThrow('paused');
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
    service.resume();
    await service.queueSave(snapshot('accepted after resume'));
    await service.flush();
    expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent pauses and rejects resume until the drain finishes', async () => {
    const writing = deferred();
    const started = deferred();
    storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
      started.resolve();
      await writing.promise;
      return { id: 'saved' };
    });
    const first = service.pause(snapshot('first'));
    await started.promise;
    const second = service.pause(snapshot('second'));
    expect(service.getState().scheduling).toBe('pausing');
    expect(() => service.resume()).toThrow('draining');
    writing.resolve();
    await Promise.all([first, second]);
    expect(
      storage.notebooks.saveNotebookSnapshot.mock.calls.map(
        ([file]) => JSON.parse(file.content).title
      )
    ).toEqual(['first', 'second']);
    expect(service.isPaused()).toBe(true);
  });

  it('restores automatic admission after a failed pause and retains the revision', async () => {
    storage.notebooks.saveNotebookSnapshot.mockRejectedValue(new Error('quota'));
    await expect(service.pause(snapshot('pending'))).rejects.toThrow('quota');
    expect(service.getState()).toMatchObject({ scheduling: 'running', isDirty: true });
    storage.notebooks.saveNotebookSnapshot.mockResolvedValue({ id: 'saved' });
    await service.queueSave(snapshot('new edit'));
    await service.pause();
    expect(service.isPaused()).toBe(true);
  });

  it('preserves newer edits submitted by observers of the supplied pause snapshot', async () => {
    let edit: Promise<void> | undefined;
    service.subscribe((event) => {
      if (event.type === 'dirty_changed' && event.progress?.currentRevision === 1)
        edit = service.queueSave(snapshot('newer observer edit'));
    });
    await service.pause(snapshot('old captured snapshot'));
    await edit;
    expect(JSON.parse(storage.notebooks.saveNotebookSnapshot.mock.calls[0][0].content).title).toBe(
      'newer observer edit'
    );
  });
});

it.each([null, '{"cells":[],"tasks":[]}'])(
  'binds empty saves to observed persisted content %j',
  async (content) => {
    storage.files.getFile.mockResolvedValue(content === null ? null : { content });
    await service.saveNow({ ...snapshot('empty'), cells: [] });
    expect(storage.notebooks.saveNotebookSnapshot.mock.calls[0][2]).toEqual({
      expectedContent: content,
    });
  }
);

it('retains an empty revision when its commit condition fails', async () => {
  storage.files.getFile.mockResolvedValue(null);
  storage.notebooks.saveNotebookSnapshot.mockRejectedValue(
    new Error('Notebook content changed before snapshot commit')
  );
  await expect(service.saveNow({ ...snapshot('empty'), cells: [] })).rejects.toThrow(
    'content changed'
  );
  expect(service.hasPending('notebook')).toBe(true);
  expect(service.getSaveProgress('notebook')).toMatchObject({ committedRevision: 0 });
});

it('conditions nonempty edits on the loaded body and then on its own committed body', async () => {
  const loaded = JSON.stringify({ cells: [{ id: 'old' }], tasks: [] });
  storage.files.getFile.mockResolvedValue({ content: loaded });
  await service.load('notebook');
  await service.saveNow(snapshot('first'));
  await service.saveNow(snapshot('second'));
  const calls = storage.notebooks.saveNotebookSnapshot.mock.calls;
  expect(calls[0][2]).toEqual({ expectedContent: loaded });
  expect(calls[1][2]).toEqual({ expectedContent: calls[0][0].content });
  expect(storage.files.getFile).toHaveBeenCalledTimes(1);
});

it('never adopts another body while retrying a rejected nonempty edit', async () => {
  const loaded = JSON.stringify({ cells: [{ id: 'old' }], tasks: [] });
  storage.files.getFile.mockResolvedValue({ content: loaded });
  await service.load('notebook');
  storage.files.getFile.mockResolvedValue({
    content: JSON.stringify({ cells: [{ id: 'other window' }] }),
  });
  storage.notebooks.saveNotebookSnapshot.mockRejectedValue(
    new Error('Notebook content changed before snapshot commit')
  );
  await expect(service.saveNow(snapshot('local'))).rejects.toThrow('content changed');
  await expect(service.flush()).rejects.toThrow('content changed');
  expect(
    storage.notebooks.saveNotebookSnapshot.mock.calls.every(
      (call) => call[2]?.expectedContent === loaded
    )
  ).toBe(true);
  expect(storage.files.getFile).toHaveBeenCalledTimes(1);
  expect(service.hasPending('notebook')).toBe(true);
});

it.each([false, true])(
  'rejects a load overtaken by a local edit (committed: %s)',
  async (commit) => {
    let resolveRead!: (value: { content: string }) => void;
    storage.files.getFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const loading = service.load('notebook');
    const rejected = expect(loading).rejects.toThrow('changed while loading');
    await vi.waitFor(() => expect(storage.files.getFile).toHaveBeenCalledTimes(1));
    if (commit) await service.saveNow(snapshot('local'));
    else await service.queueSave(snapshot('local'));
    resolveRead({ content: JSON.stringify({ cells: [{ id: 'stale' }] }) });
    await rejected;
    if (!commit) await service.flush();
    expect(storage.notebooks.saveNotebookSnapshot.mock.calls[0][2]).toEqual({
      expectedContent: null,
    });
  }
);

it('publishes one blocked failure for a typed storage conflict without automatic retries', async () => {
  const conflict = new NotebookConflictError('notebook', 'notebook_notebook.json');
  storage.notebooks.saveNotebookSnapshot.mockRejectedValue(conflict);
  const failures: string[] = [];
  service.subscribe((event) => {
    if (event.type === 'save_failed') failures.push(event.error!);
  });
  await expect(service.saveNow(snapshot('conflict'))).rejects.toBe(conflict);
  expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
  expect(failures).toEqual([conflict.message]);
  expect(service.getSaveProgress('notebook')).toMatchObject({
    phase: 'blocked',
    committedRevision: 0,
  });
});

it('awaits durable recovery before reporting the original conflict without acknowledging the edit', async () => {
  const gate = deferred();
  const conflict = new NotebookConflictError('notebook', 'notebook_notebook.json');
  storage.notebooks.saveNotebookSnapshot.mockRejectedValue(conflict);
  storage.recovery.saveDraft.mockImplementation(() => gate.promise);
  const failures: string[] = [];
  service.subscribe((event) => {
    if (event.type === 'save_failed') failures.push(event.error!);
  });
  const rejected = expect(service.saveNow(snapshot('recover me'))).rejects.toBe(conflict);
  await vi.waitFor(() => expect(storage.recovery.saveDraft).toHaveBeenCalledTimes(1));
  expect(failures).toEqual([]);
  const draft = storage.recovery.saveDraft.mock.calls[0][0];
  expect(JSON.parse(draft.content).cells[0].content).toBe('# recover me');
  expect(draft).toMatchObject({
    notebookId: 'notebook',
    expectedContent: null,
    reason: 'content_changed',
    revision: 1,
  });
  gate.resolve();
  await rejected;
  expect(service.getSaveProgress('notebook')).toMatchObject({
    phase: 'blocked',
    committedRevision: 0,
  });
});

it('reports recovery failure and retains the pending edit without retrying the conflict', async () => {
  storage.notebooks.saveNotebookSnapshot.mockRejectedValue(
    new NotebookConflictError('notebook', 'body')
  );
  storage.recovery.saveDraft.mockRejectedValue(new Error('recovery quota'));
  await expect(service.saveNow(snapshot('keep in memory'))).rejects.toThrow(
    'conflict recovery could not be saved: recovery quota'
  );
  expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1);
  expect(service.hasPending('notebook')).toBe(true);
});

it('captures the newest queued revision when the active write discovers a conflict', async () => {
  const gate = deferred();
  storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
    await gate.promise;
    throw new NotebookConflictError('notebook', 'body');
  });
  const rejected = expect(service.saveNow(snapshot('older'))).rejects.toThrow('content changed');
  await vi.waitFor(() => expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(1));
  await service.queueSave(snapshot('newest'));
  gate.resolve();
  await rejected;
  const draft = storage.recovery.saveDraft.mock.calls[0][0];
  expect(draft.revision).toBe(service.getSaveProgress('notebook')?.currentRevision);
  expect(JSON.parse(draft.content).cells[0].content).toBe('# newest');
  expect(service.hasPending('notebook')).toBe(true);
});

it('retains immutable per-notebook failures for late subscribers until pending work is committed', async () => {
  storage.notebooks.saveNotebookSnapshot.mockRejectedValueOnce(
    new NotebookConflictError('a', 'notebook_a.json')
  );
  await expect(service.saveNow(snapshot('local', 'a'))).rejects.toThrow('content changed');
  const failed = service.getSaveFailures();
  expect(failed.a).toContain('content changed');
  expect(Object.isFrozen(failed)).toBe(true);
  expect(service.getSaveFailures()).toBe(failed);
  service.clearError();
  await service.queueSave(snapshot('newer', 'a'));
  await service.saveNow(snapshot('unrelated', 'b'));
  expect(service.getSaveFailures()).toBe(failed);
  let observed: Readonly<Record<string, string>> | undefined;
  const unsubscribe = service.subscribe((event) => {
    if (event.type === 'save_completed' && event.notebookId === 'a')
      observed = service.getSaveFailures();
  });
  await service.flush('a');
  unsubscribe();
  expect(observed).toEqual({});
  expect(service.getSaveFailures()).toEqual({});
  expect(failed.a).toContain('content changed');
});

it('clears only explicitly discarded failures and releases all warnings on disposal', async () => {
  storage.notebooks.saveNotebookSnapshot.mockImplementation(async (file) => {
    throw new NotebookConflictError(file.notebookId, file.filePath);
  });
  await expect(service.saveNow(snapshot('a', 'a'))).rejects.toThrow();
  await expect(service.saveNow(snapshot('b', 'b'))).rejects.toThrow();
  service.clearPending('a');
  expect(Object.keys(service.getSaveFailures())).toEqual(['b']);
  await AutoSaveService.resetInstance();
  expect(service.getSaveFailures()).toEqual({});
});

it('keeps a failure visible when an older revision commits while newer edits remain pending', async () => {
  storage.notebooks.saveNotebookSnapshot.mockRejectedValueOnce(
    new NotebookConflictError('notebook', 'notebook_notebook.json')
  );
  await expect(service.saveNow(snapshot('first'))).rejects.toThrow();
  const gate = deferred();
  storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
    await gate.promise;
    return { id: 'saved' };
  });
  const draining = service.flush();
  await vi.waitFor(() => expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledTimes(2));
  await service.queueSave(snapshot('newer'));
  const warnings: boolean[] = [];
  service.subscribe((event) => {
    if (event.type === 'save_completed') warnings.push(Boolean(service.getSaveFailures().notebook));
  });
  gate.resolve();
  await draining;
  expect(warnings).toEqual([true, false]);
});

it('persists the accepted revision despite caller edits during debounce', async () => {
  const input = snapshot('accepted');
  input.cells[0].metadata = { label: 'original' };
  await service.queueSave(input);
  input.cells[0].content = 'not admitted';
  input.cells[0].metadata.label = 'not admitted';
  input.cells.push({ id: 'late', type: 'markdown', content: 'not admitted' });
  await service.flush();
  const saved = JSON.parse(storage.notebooks.saveNotebookSnapshot.mock.calls[0][0].content);
  expect(saved.cells).toEqual([
    {
      id: 'title',
      type: 'markdown',
      content: '# accepted',
      outputs: [],
      metadata: { label: 'original' },
    },
  ]);
});
it('retries the same revision body after its caller mutates the input', async () => {
  const input = snapshot('accepted');
  storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
    input.cells[0].content = 'mutated after first attempt';
    throw new Error('temporary storage error');
  });
  await service.saveNow(input);
  const writes = storage.notebooks.saveNotebookSnapshot.mock.calls.map(([file]) => file.content);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toBe(writes[0]);
  expect(JSON.parse(writes[1]).cells[0].content).toBe('# accepted');
});

it('does not start pausing or drain accepted edits when pause snapshot admission fails', async () => {
  await service.queueSave(snapshot('accepted'));
  const previous = service.getSaveProgress('notebook');
  const invalid = snapshot('invalid');
  invalid.cells[0].metadata = { callback: () => {} };
  await expect(service.pause(invalid)).rejects.toThrow();
  await service.waitForComplete();
  expect(service.getState().scheduling).toBe('running');
  expect(service.getSaveProgress('notebook')).toBe(previous);
  expect(storage.notebooks.saveNotebookSnapshot).not.toHaveBeenCalled();
  await service.pause();
  expect(service.isPaused()).toBe(true);
  expect(JSON.parse(storage.notebooks.saveNotebookSnapshot.mock.calls[0][0].content).title).toBe(
    'accepted'
  );
});

it('preserves an active pause when a concurrent caller supplies an uncloneable edit', async () => {
  const gate = deferred();
  const started = deferred();
  storage.notebooks.saveNotebookSnapshot.mockImplementationOnce(async () => {
    started.resolve();
    await gate.promise;
    return { id: 'file' };
  });
  const first = service.pause(snapshot('accepted'));
  await started.promise;
  const progress = service.getSaveProgress('notebook');
  const invalid = snapshot('invalid');
  invalid.cells[0].metadata = { callback: () => {} };
  await expect(service.pause(invalid)).rejects.toThrow();
  expect(service.getState().scheduling).toBe('pausing');
  expect(service.getSaveProgress('notebook')).toBe(progress);
  gate.resolve();
  await first;
  expect(service.isPaused()).toBe(true);
  expect(storage.notebooks.saveNotebookSnapshot).toHaveBeenCalledOnce();
});
