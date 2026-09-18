import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSaveService } from './AutoSaveService';
import { AutoSaveStatus, type NotebookSnapshot } from './types';

const storage = vi.hoisted(() => ({
  initialize: vi.fn(),
  notebooks: { saveNotebook: vi.fn() },
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
