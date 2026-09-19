import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSaveService } from './AutoSaveService';
import { AutoSaveStatus, type NotebookSnapshot } from './types';

const storage = vi.hoisted(() => ({
  initialize: vi.fn(),
  notebooks: { saveNotebook: vi.fn(), getNotebook: vi.fn() },
  files: { saveFile: vi.fn(), getFile: vi.fn(), getFilesForNotebook: vi.fn() },
}));
vi.mock('../persistence/PersistenceService', () => ({
  PersistenceService: class {
    initialize = storage.initialize;
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
  storage.notebooks.saveNotebook.mockResolvedValue({});
  storage.files.saveFile.mockResolvedValue({ id: 'file', hasLocalContent: true });
  storage.files.getFilesForNotebook.mockResolvedValue([]);
  service = AutoSaveService.getInstance({ debounceMs: 60000, maxRetries: 1, retryDelayMs: 0 });
});
afterEach(() => AutoSaveService.resetInstance());

describe('single-writer autosave', () => {
  it('reuses unchanged text byte counts but invalidates in-place content edits', async () => {
    const NativeBlob = globalThis.Blob;
    const measured: unknown[] = [];
    vi.stubGlobal(
      'Blob',
      class extends NativeBlob {
        constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
          super(parts, options);
          measured.push(parts[0]);
        }
      }
    );
    try {
      const data = snapshot('size');
      data.cells[0].content = '中文 🐍';
      await service.saveNow(data);
      await service.saveNow({ ...data, notebookTitle: 'renamed' });
      expect(measured.filter((value) => value === '中文 🐍')).toHaveLength(1);
      expect(storage.notebooks.saveNotebook.mock.calls[1][0].totalSize).toBe(
        new NativeBlob(['中文 🐍']).size
      );
      data.cells[0].content = 'changed';
      await service.saveNow(data);
      expect(measured.filter((value) => value === 'changed')).toHaveLength(1);
      expect(storage.notebooks.saveNotebook.mock.calls[2][0].totalSize).toBe(7);
    } finally {
      vi.unstubAllGlobals();
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
      expect(storage.files.saveFile).not.toHaveBeenCalled();
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
    expect(storage.files.saveFile).not.toHaveBeenCalled();
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
      expect(storage.files.saveFile).not.toHaveBeenCalled();
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
    expect(storage.files.saveFile).not.toHaveBeenCalled();
    expect(service.hasPending('notebook')).toBe(true);
    expect(service.getState().isDirty).toBe(true);
    storage.files.getFile.mockResolvedValue({ content: JSON.stringify({ cells: [], tasks: [] }) });
    await service.flush();
    expect(storage.files.saveFile).toHaveBeenCalledTimes(1);
    expect(service.hasPending('notebook')).toBe(false);
  });

  it('does not replace a corrupt stored notebook with an empty snapshot', async () => {
    storage.files.getFile.mockResolvedValue({ content: '{broken json' });
    await expect(service.saveNow({ ...snapshot('empty'), cells: [] })).rejects.toThrow();
    expect(storage.notebooks.saveNotebook).not.toHaveBeenCalled();
    expect(storage.files.saveFile).not.toHaveBeenCalled();
    expect(service.hasPending('notebook')).toBe(true);
  });

  it('reports corrupt stored content as a load failure rather than an empty notebook', async () => {
    storage.files.getFile.mockResolvedValue({ content: '{broken json' });
    const events: string[] = [];
    service.subscribe((event) => events.push(event.type));
    await expect(service.load('notebook')).rejects.toThrow();
    expect(events).toContain('load_failed');
    expect(events).not.toContain('load_completed');
    expect(storage.files.saveFile).not.toHaveBeenCalled();
  });
  it('coalesces queued edits and forces local persistence', async () => {
    await service.queueSave(snapshot('old'));
    await service.queueSave(snapshot('new'));
    await service.flush();
    expect(storage.files.saveFile).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.files.saveFile.mock.calls[0][0].content).title).toBe('new');
    expect(storage.files.saveFile.mock.calls[0][1]).toEqual({ forceLocal: true });
    expect(service.getState().isDirty).toBe(false);
  });

  it('serializes immediate saves behind an in-flight revision', async () => {
    const gate = deferred();
    storage.files.saveFile.mockImplementationOnce(async () => {
      await gate.promise;
      return { id: 'old' };
    });
    const first = service.saveNow(snapshot('old'));
    await vi.waitFor(() => expect(storage.files.saveFile).toHaveBeenCalledTimes(1));
    const second = service.saveNow(snapshot('new'));
    expect(service.getState().isDirty).toBe(true);
    expect(storage.files.saveFile).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(
      storage.files.saveFile.mock.calls.map(([file]) => JSON.parse(file.content).title)
    ).toEqual(['old', 'new']);
    expect(service.hasPending()).toBe(false);
  });

  it('retries transient errors without losing the snapshot', async () => {
    storage.files.saveFile.mockRejectedValueOnce(new Error('temporary'));
    await service.saveNow(snapshot('keep'));
    expect(storage.files.saveFile).toHaveBeenCalledTimes(2);
    expect(service.getState().isDirty).toBe(false);
  });

  it('replaces a failed in-flight revision with the latest edit without retrying stale content', async () => {
    const gate = deferred();
    storage.files.saveFile.mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('old revision failed');
    });
    const saving = service.saveNow(snapshot('old'));
    await vi.waitFor(() => expect(storage.files.saveFile).toHaveBeenCalledTimes(1));
    await service.queueSave(snapshot('new'));
    gate.resolve();
    await saving;
    expect(
      storage.files.saveFile.mock.calls.map(([file]) => JSON.parse(file.content).title)
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
    expect(storage.files.saveFile).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.files.saveFile.mock.calls[0][0].content).title).toBe('corrected');
    expect(service.getState()).toMatchObject({ isDirty: false, pendingCount: 0, error: null });
  });

  it('retains failed writes and refuses to report a successful pause', async () => {
    storage.files.saveFile.mockRejectedValue(new Error('disk full'));
    await expect(service.pause(snapshot('unsaved'))).rejects.toThrow('disk full');
    expect(service.hasPending('notebook')).toBe(true);
    expect(service.getState().isDirty).toBe(true);
    expect(service.getStatus()).not.toBe(AutoSaveStatus.DISCONNECTED);
    storage.files.saveFile.mockResolvedValue({ id: 'recovered' });
    await service.flush();
    expect(service.getState().isDirty).toBe(false);
  });

  it('continues saving other notebooks when one exhausts retries', async () => {
    storage.files.saveFile.mockImplementation(async (file) => {
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
    storage.files.saveFile.mockImplementation(async (file) => {
      if (file.notebookId === 'failed') {
        await gate.promise;
        throw new Error('unavailable');
      }
      return { id: 'healthy' };
    });
    const first = service.saveNow(snapshot('bad', 'failed'));
    const failed = expect(first).rejects.toThrow('unavailable');
    await vi.waitFor(() => expect(storage.files.saveFile).toHaveBeenCalledTimes(1));
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
    const calls = storage.files.saveFile.mock.calls;
    expect(JSON.parse(calls[calls.length - 1][0].content).title).toBe('later edit');
    expect(service.isPaused()).toBe(true);
  });
});
