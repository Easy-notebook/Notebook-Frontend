import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  fetch: vi.fn(),
  fileRead: vi.fn(),
  fileSave: vi.fn(),
  loadTabs: vi.fn(),
  defaults: vi.fn(),
}));
vi.mock('@Services/persistence/instance', () => ({
  persistenceService: {
    splitFiles: { getFile: io.read, saveFile: io.save },
    files: { getFile: io.fileRead, saveFile: io.fileSave },
  },
}));
vi.mock('@Services/notebook/FileService', () => ({ FileService: { getFile: io.fetch } }));
vi.mock('@Services/tab/TabManagerService', () => ({
  tabManagerService: {
    loadDefaultTabs: io.defaults,
    loadTabs: io.loadTabs,
    saveTabs: vi.fn(async () => undefined),
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
  io.defaults.mockResolvedValue([]);
  io.loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  io.fileRead.mockResolvedValue(undefined);
  io.fileSave.mockResolvedValue(undefined);
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

const tab = (book: string, path = 'file.txt') => ({
  id: `${book}::${path}`,
  path,
  name: path,
  type: 'text' as const,
});
const fileRecord = (book: string, path = 'file.txt') => ({
  metadata: {
    id: `${book}::${path}`,
    notebookId: book,
    filePath: path,
    fileName: path,
    fileType: 'text',
    lastModified: '2026-01-01',
    size: 1,
    cachedAt: 1,
    accessCount: 1,
    lastAccessedAt: 1,
  },
  content: `${book}/${path}`,
});

describe('normal preview request ownership', () => {
  it.each(['same', 'other'])(
    'keeps the latest default tabs when an older %s notebook request finishes',
    async (nextBook) => {
      const old = deferred<ReturnType<typeof tab>[]>();
      io.defaults.mockReturnValueOnce(old.promise);
      const pending = state().loadNotebookTabs('same');
      await vi.waitFor(() => expect(io.defaults).toHaveBeenCalledOnce());
      const latest = [tab(nextBook, 'new.txt')];
      io.defaults.mockResolvedValueOnce(latest);
      await state().loadNotebookTabs(nextBook);
      old.resolve([tab('same', 'old.txt')]);
      await pending;
      expect(state().currentPreviewFiles).toEqual(latest);
      expect(state().currentNotebookId).toBe(nextBook);
      expect(state().isLoading).toBe(false);
    }
  );

  it('ignores an old discovery error while the latest request is loading', async () => {
    const old = deferred<ReturnType<typeof tab>[]>();
    const next = deferred<ReturnType<typeof tab>[]>();
    io.defaults.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const pending = state().loadNotebookTabs('old');
    await vi.waitFor(() => expect(io.defaults).toHaveBeenCalledTimes(1));
    const current = state().loadNotebookTabs('new');
    await vi.waitFor(() => expect(io.defaults).toHaveBeenCalledTimes(2));
    old.reject(new Error('obsolete discovery failure'));
    await pending;
    expect(state().isLoading).toBe(true);
    expect(state().error).toBeNull();
    next.resolve([tab('new')]);
    await current;
  });

  it('does not start default discovery after an obsolete saved-state miss', async () => {
    const old = deferred<null>();
    io.loadTabs.mockReturnValueOnce(old.promise);
    const pending = state().loadTabState('old');
    await vi.waitFor(() => expect(io.loadTabs).toHaveBeenCalledOnce());
    await state().loadTabState('new');
    old.resolve(null);
    await pending;
    expect(io.defaults).not.toHaveBeenCalled();
    expect(state().currentNotebookId).toBe('new');
  });

  it('restores saved active content through the same request', async () => {
    io.loadTabs.mockResolvedValueOnce({ tabs: [tab('book')], activeTabId: 'book::file.txt' });
    io.fileRead.mockResolvedValueOnce(fileRecord('book'));
    await state().loadTabState('book');
    expect(state().activeFile?.content).toBe('book/file.txt');
    expect(state().previewMode).toBe('file');
    expect(state().isLoading).toBe(false);
  });

  it('cannot activate a stale restored file after switching notebooks', async () => {
    const old = deferred<ReturnType<typeof fileRecord>>();
    io.loadTabs.mockResolvedValueOnce({ tabs: [tab('old')], activeTabId: 'old::file.txt' });
    io.fileRead.mockReturnValueOnce(old.promise);
    const pending = state().loadTabState('old');
    await vi.waitFor(() => expect(io.fileRead).toHaveBeenCalledOnce());
    await state().loadNotebookTabs('new');
    old.resolve(fileRecord('old'));
    await pending;
    expect(state().currentNotebookId).toBe('new');
    expect(state().activeFile).toBeNull();
    expect(state().previewMode).toBe('notebook');
  });

  it('does not admit a stale switch after its outgoing tab save completes', async () => {
    const save = deferred<void>();
    const original = state().saveTabState;
    usePreviewStore.setState({ currentNotebookId: 'origin', saveTabState: () => save.promise });
    const old = state().switchToNotebook('old');
    try {
      await state().loadNotebookTabs('new');
      save.resolve();
      await old;
      expect(state().currentNotebookId).toBe('new');
      expect(io.loadTabs).not.toHaveBeenCalled();
    } finally {
      usePreviewStore.setState({ saveTabState: original });
    }
  });

  it.each(['clearNotebookState', 'resetToNotebookMode'] as const)(
    '%s prevents a saved state from returning',
    async (action) => {
      const old = deferred<{ tabs: ReturnType<typeof tab>[]; activeTabId: null }>();
      io.loadTabs.mockReturnValueOnce(old.promise);
      const pending = state().loadTabState('old');
      await vi.waitFor(() => expect(io.loadTabs).toHaveBeenCalledOnce());
      state()[action]();
      old.resolve({ tabs: [tab('old')], activeTabId: null });
      await pending;
      expect(state().currentPreviewFiles).toEqual([]);
      expect(state().isLoading).toBe(false);
    }
  );

  it('explicit file selection supersedes a pending restoration', async () => {
    const old = deferred<ReturnType<typeof fileRecord>>();
    io.fileRead.mockReturnValueOnce(old.promise);
    const pending = state().loadFileById('book::old.txt');
    state().setActiveFile(null);
    old.resolve(fileRecord('book', 'old.txt'));
    expect(await pending).toBeNull();
    expect(state().activeFile).toBeNull();
  });

  it('cancels a network response before it can write or activate a file', async () => {
    const response = deferred<{ status: string; content: string }>();
    io.fetch.mockReturnValueOnce(response.promise);
    const pending = state().previewFile('book', 'old.txt');
    await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledOnce());
    state().resetToNotebookMode();
    response.resolve({ status: 'ok', content: 'obsolete' });
    expect(await pending).toBeUndefined();
    expect(io.fileSave).not.toHaveBeenCalled();
    expect(state().activeFile).toBeNull();
  });

  it('preserves replacement state when a subscriber replaces a just-published file', async () => {
    io.fileRead.mockResolvedValueOnce(fileRecord('book'));
    const unsubscribe = usePreviewStore.subscribe((next) => {
      if (next.activeFile) next.clearNotebookState();
    });
    try {
      expect(await state().previewFile('book', 'file.txt')).toBeUndefined();
      expect(state().currentPreviewFiles).toEqual([]);
      expect(state().activeFile).toBeNull();
      expect(state().isLoading).toBe(false);
    } finally {
      unsubscribe();
    }
  });
  it('closing the active tab removes it immediately without restoring stale neighbors', async () => {
    io.fileRead.mockResolvedValueOnce(fileRecord('book', 'first.txt'));
    await state().loadFileById('book::first.txt');
    usePreviewStore.setState({
      currentNotebookId: 'book',
      currentPreviewFiles: [tab('book', 'first.txt'), tab('book', 'second.txt')],
    });
    const neighbor = deferred<ReturnType<typeof fileRecord>>();
    io.fileRead.mockReturnValueOnce(neighbor.promise);
    state().closePreviewFile('book::first.txt');
    expect(state().currentPreviewFiles).toEqual([tab('book', 'second.txt')]);
    await state().loadNotebookTabs('new');
    neighbor.resolve(fileRecord('book', 'second.txt'));
    // Drain the close operation's chained continuation.
    await Promise.resolve();
    await Promise.resolve();
    expect(state().currentNotebookId).toBe('new');
    expect(state().currentPreviewFiles).toEqual([]);
    expect(state().activeFile).toBeNull();
  });

  it('an explicit view change supersedes pending active-tab restoration', async () => {
    const read = deferred<ReturnType<typeof fileRecord>>();
    io.loadTabs.mockResolvedValueOnce({ tabs: [tab('book')], activeTabId: 'book::file.txt' });
    io.fileRead.mockReturnValueOnce(read.promise);
    const pending = state().loadTabState('book');
    await vi.waitFor(() => expect(io.fileRead).toHaveBeenCalledOnce());
    usePreviewStore.setState({ previewMode: 'file' });
    state().changePreviewMode();
    read.resolve(fileRecord('book'));
    await pending;
    expect(state().previewMode).toBe('notebook');
    expect(state().activeFile).toBeNull();
    expect(state().isLoading).toBe(false);
  });
  it('clears a previous notebook active file when restoring a notebook without an active tab', async () => {
    io.fileRead.mockResolvedValueOnce(fileRecord('old'));
    await state().loadFileById('old::file.txt');
    usePreviewStore.setState({ currentNotebookId: 'old', previewMode: 'file' });
    await state().loadTabState('new');
    expect(state().currentNotebookId).toBe('new');
    expect(state().activeFile).toBeNull();
    expect(state().activePreviewMode).toBeNull();
    expect(state().previewMode).toBe('notebook');
  });
});

describe('shared renderer content across normal and split preview', () => {
  it.each([
    ['photo.PNG', 'aGVsbG8=', 'data:image/png;base64,aGVsbG8='],
    ['photo.jpg', 'aGVsbG8=', 'data:image/jpeg;base64,aGVsbG8='],
    ['icon.svg', 'PHN2Zy8+', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ['report.pdf', 'JVBERg==', 'data:application/pdf;base64,JVBERg=='],
    ['report.doc', 'aGVsbG8=', 'data:application/msword;base64,aGVsbG8='],
    [
      'report.docx',
      'aGVsbG8=',
      'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,aGVsbG8=',
    ],
    ['photo.png', 'data:image/png;base64,original', 'data:image/png;base64,original'],
    ['report.pdf', 'data:application/pdf;base64,original', 'data:application/pdf;base64,original'],
    [
      'report.docx',
      'data:application/custom;base64,original',
      'data:application/custom;base64,original',
    ],
    ['report.docx', '', ''],
    ['notes.txt', '  exact text\n', '  exact text\n'],
    ['sheet.xlsx', 'raw spreadsheet payload', 'raw spreadsheet payload'],
  ])(
    '%s publishes and caches the same renderer payload in both modes',
    async (path, content, expected) => {
      io.read.mockResolvedValue(undefined);
      io.fetch.mockResolvedValue({ status: 'ok', content });
      const normal = await state().previewFile('book', path);
      const split = await state().previewFileInSplit('book', path);
      expect(normal?.content).toBe(expected);
      expect(split?.content).toBe(expected);
      expect(io.fileSave).toHaveBeenCalledWith(expect.objectContaining({ content: expected }));
      expect(io.save).toHaveBeenCalledWith(
        'book',
        path,
        expect.objectContaining({ content: expected })
      );
    }
  );

  it.each(['', 'https://files.example.test/api/'])(
    'routes an empty PDF through the encoded asset address with base %s',
    async (base) => {
      const original = window.Backend_BASE_URL;
      window.Backend_BASE_URL = base;
      try {
        io.read.mockResolvedValue(undefined);
        io.fetch.mockResolvedValue({ status: 'ok', content: '' });
        const notebookId = 'book /一';
        const path = 'folder/report #1.pdf';
        const expected = `${base.replace(/\/$/, '')}/assets/book%20%2F%E4%B8%80/report%20%231.pdf`;
        expect((await state().previewFile(notebookId, path))?.content).toBe(expected);
        expect((await state().previewFileInSplit(notebookId, path))?.content).toBe(expected);
      } finally {
        window.Backend_BASE_URL = original;
      }
    }
  );
});
