import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), fetch: vi.fn() }));
vi.mock('@Services/persistence/instance', () => ({
  persistenceService: { splitFiles: { getFile: io.read, saveFile: io.save } },
}));
vi.mock('@Services/notebook/FileService', () => ({ FileService: { getFile: io.fetch } }));
vi.mock('@Services/tab/TabManagerService', () => ({
  tabManagerService: {
    loadDefaultTabs: vi.fn(async () => []),
    loadTabs: vi.fn(async () => ({ tabs: [], activeTabId: null })),
  },
}));
import usePreviewStore from './previewStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const cached = (path: string) => ({
  id: `book::${path}`,
  notebookId: 'book',
  fileName: path,
  filePath: path,
  content: path,
  type: 'text',
  size: 1,
  lastModified: '2026-01-01',
  cachedAt: 1,
});
const state = () => usePreviewStore.getState();
const preview = (path: string) => state().previewFileInSplit('book', path);

beforeEach(() => {
  state().clearNotebookState();
  vi.resetAllMocks();
  io.read.mockImplementation(async (_book, path) => cached(path));
  io.fetch.mockResolvedValue({ status: 'ok', content: 'network content' });
  io.save.mockResolvedValue(undefined);
});

describe('split preview request ownership', () => {
  it('returns and publishes cached content', async () => {
    const result = await preview('current.txt');
    expect(result?.content).toBe('current.txt');
    expect(state().activeSplitFile).toBe(result);
    expect(state().isSplitLoading).toBe(false);
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it('persists fetched content before publishing it', async () => {
    io.read.mockResolvedValue(undefined);
    const write = deferred<void>();
    io.save.mockReturnValue(write.promise);
    const pending = preview('new.txt');
    await vi.waitFor(() => expect(io.save).toHaveBeenCalledOnce());
    expect(state().activeSplitFile).toBeNull();
    expect(state().isSplitLoading).toBe(true);
    write.resolve();
    expect((await pending)?.content).toBe('network content');
    expect(state().isSplitLoading).toBe(false);
  });

  it('ignores an older cache read after a newer request succeeds', async () => {
    const old = deferred<undefined>();
    io.read.mockReturnValueOnce(old.promise);
    const pending = preview('old.txt');
    const current = await preview('current.txt');
    old.resolve(undefined);
    expect(await pending).toBeUndefined();
    expect(state().activeSplitFile).toBe(current);
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores stale network %s without overwriting newer loading state',
    async (outcome) => {
      const old = deferred<{ status: string; content: string }>();
      io.read.mockResolvedValueOnce(undefined);
      io.fetch.mockReturnValueOnce(old.promise);
      const pending = preview('old.txt');
      await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledOnce());
      const next = deferred<ReturnType<typeof cached>>();
      io.read.mockReturnValueOnce(next.promise);
      const current = preview('current.txt');
      if (outcome === 'resolve') old.resolve({ status: 'ok', content: 'old' });
      else old.reject(new Error('old failure'));
      expect(await pending).toBeUndefined();
      expect(state().isSplitLoading).toBe(true);
      expect(state().error).toBeNull();
      expect(io.save).not.toHaveBeenCalled();
      next.resolve(cached('current.txt'));
      await current;
      expect(state().activeSplitFile?.path).toBe('current.txt');
    }
  );

  it.each(['closeSplitPreview', 'clearNotebookState', 'resetToNotebookMode'] as const)(
    '%s invalidates a pending cache read',
    async (action) => {
      const read = deferred<ReturnType<typeof cached>>();
      io.read.mockReturnValueOnce(read.promise);
      const pending = preview('old.txt');
      state()[action]();
      read.resolve(cached('old.txt'));
      expect(await pending).toBeUndefined();
      expect(state().activeSplitFile).toBeNull();
      expect(state().isSplitLoading).toBe(false);
    }
  );

  it('allows an admitted cache write to finish without reopening a closed preview', async () => {
    io.read.mockResolvedValueOnce(undefined);
    const write = deferred<void>();
    io.save.mockReturnValueOnce(write.promise);
    const pending = preview('old.txt');
    await vi.waitFor(() => expect(io.save).toHaveBeenCalledOnce());
    state().closeSplitPreview();
    write.resolve();
    expect(await pending).toBeUndefined();
    expect(state().activeSplitFile).toBeNull();
    expect(state().isSplitLoading).toBe(false);
  });

  it('publishes a current request failure', async () => {
    io.read.mockRejectedValueOnce(new Error('read unavailable'));
    expect(await preview('failed.txt')).toBeUndefined();
    expect(state().error).toContain('read unavailable');
    expect(state().isSplitLoading).toBe(false);
  });

  it('does not start I/O when a synchronous subscriber closes the request', async () => {
    const unsubscribe = usePreviewStore.subscribe((next) => {
      if (next.isSplitLoading) next.closeSplitPreview();
    });
    try {
      expect(await preview('closed.txt')).toBeUndefined();
      expect(io.read).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it.each(['loadTabState', 'loadNotebookTabs'] as const)(
    '%s invalidates a previous notebook preview',
    async (action) => {
      usePreviewStore.setState({ currentNotebookId: 'book' });
      const read = deferred<ReturnType<typeof cached>>();
      io.read.mockReturnValueOnce(read.promise);
      const pending = preview('old.txt');
      await state()[action]('other');
      read.resolve(cached('old.txt'));
      expect(await pending).toBeUndefined();
      expect(state().activeSplitFile).toBeNull();
      expect(state().isSplitLoading).toBe(false);
    }
  );

  it('invalidates split loading immediately when notebook switching is admitted', async () => {
    const read = deferred<ReturnType<typeof cached>>();
    const saved = deferred<void>();
    const saveTabState = state().saveTabState;
    usePreviewStore.setState({ currentNotebookId: 'book', saveTabState: () => saved.promise });
    io.read.mockReturnValueOnce(read.promise);
    const pending = preview('old.txt');
    const switching = state().switchToNotebook('other');
    try {
      expect(state().isSplitLoading).toBe(false);
      read.resolve(cached('old.txt'));
      expect(await pending).toBeUndefined();
      expect(state().activeSplitFile).toBeNull();
    } finally {
      saved.resolve();
      await switching;
      usePreviewStore.setState({ saveTabState });
    }
    expect(state().currentNotebookId).toBe('other');
  });
});
