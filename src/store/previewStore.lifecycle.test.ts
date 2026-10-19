import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  read: vi.fn(),
  splitUpdate: vi.fn(),
  save: vi.fn(),
  fetch: vi.fn(),
  fileRead: vi.fn(),
  fileSave: vi.fn(),
  fileUpdate: vi.fn(),
  fileDelete: vi.fn(),
  fileClear: vi.fn(),
  loadTabs: vi.fn(),
  defaults: vi.fn(),
  tabSave: vi.fn(),
}));
vi.mock('@Services/persistence/instance', () => ({
  persistenceService: {
    splitFiles: { getFile: io.read, saveFile: io.save, updateFileContent: io.splitUpdate },
    files: {
      getFile: io.fileRead,
      saveFile: io.fileSave,
      updateFileContent: io.fileUpdate,
      deleteFile: io.fileDelete,
      clearNotebook: io.fileClear,
    },
  },
}));
vi.mock('@Services/notebook/FileService', () => ({ FileService: { getFile: io.fetch } }));
vi.mock('@Services/tab/TabManagerService', async (importOriginal) => {
  const original = await importOriginal<typeof import('@Services/tab/TabManagerService')>();
  return {
    tabManagerService: {
      addTab: original.tabManagerService.addTab.bind(original.tabManagerService),
      loadDefaultTabs: io.defaults,
      loadTabs: io.loadTabs,
      saveTabs: io.tabSave,
    },
  };
});
import usePreviewStore from './previewStore';
import { HttpResponseError } from '@Services/notebook/HttpResponseError';

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
  io.fileSave.mockImplementation(async (data) => ({
    id: `${data.notebookId}::${data.filePath}`,
    notebookId: data.notebookId,
    filePath: data.filePath,
    fileName: data.fileName,
    fileType: data.fileType,
    size: data.size,
    lastModified: data.lastModified,
    cachedAt: 101,
    accessCount: 2,
    lastAccessedAt: 102,
    storageType: 'local',
    hasLocalContent: true,
  }));
  io.fileUpdate.mockResolvedValue(true);
  io.splitUpdate.mockResolvedValue(true);
  io.tabSave.mockResolvedValue(undefined);
  io.fileDelete.mockResolvedValue(true);
  io.fileClear.mockResolvedValue(undefined);
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

describe('cache mutation publication', () => {
  it('clears only target notebook tabs without choosing a different active file', async () => {
    io.fileRead.mockResolvedValueOnce(fileRecord('other', 'chosen.txt'));
    await state().loadFileById('other::chosen.txt');
    const active = state().activeFile;
    usePreviewStore.setState({
      currentNotebookId: 'other',
      currentPreviewFiles: [tab('book'), tab('other', 'first.txt'), tab('other', 'chosen.txt')],
      dirtyMap: { 'book::file.txt': true, 'other::chosen.txt': true },
    });
    expect(await state().clearCacheForNotebook('book')).toBe(true);
    expect(io.fileClear).toHaveBeenCalledWith('book');
    expect(state().activeFile).toBe(active);
    expect(state().currentPreviewFiles).toEqual([
      tab('other', 'first.txt'),
      tab('other', 'chosen.txt'),
    ]);
    expect(state().dirtyMap).toEqual({ 'other::chosen.txt': true });
    expect(io.fileRead).toHaveBeenCalledOnce();
  });

  it('clears the target active file after a successful commit', async () => {
    io.fileRead.mockResolvedValueOnce(fileRecord('book'));
    await state().loadFileById('book::file.txt');
    usePreviewStore.setState({ currentPreviewFiles: [tab('book')], previewMode: 'file' });
    expect(await state().clearCacheForNotebook('book')).toBe(true);
    expect(state().activeFile).toBeNull();
    expect(state().activePreviewMode).toBeNull();
    expect(state().previewMode).toBe('notebook');
  });

  it.each(['clear', 'delete'] as const)(
    'a late %s completion reports persistence success without closing a reopened view',
    async (action) => {
      const commit = deferred<true>();
      (action === 'clear' ? io.fileClear : io.fileDelete).mockReturnValueOnce(commit.promise);
      const pending =
        action === 'clear'
          ? state().clearCacheForNotebook('book')
          : state().deleteFileFromCache('book', 'file.txt');
      io.fileRead.mockResolvedValueOnce(fileRecord('book'));
      const reopened = await state().loadFileById('book::file.txt');
      usePreviewStore.setState({ currentPreviewFiles: [tab('book')] });
      commit.resolve(true);
      expect(await pending).toBe(true);
      expect(state().activeFile).toBe(reopened);
      expect(state().currentPreviewFiles).toEqual([tab('book')]);
    }
  );

  it('a late failure does not overwrite the newer request error or loading flag', async () => {
    const commit = deferred<void>();
    io.fileClear.mockReturnValueOnce(commit.promise);
    const pending = state().clearCacheForNotebook('book');
    state().clearNotebookState();
    usePreviewStore.setState({ error: 'new view error' });
    commit.reject(new Error('transaction aborted'));
    expect(await pending).toBe(false);
    expect(state().error).toBe('new view error');
    expect(state().isLoading).toBe(false);
  });

  it('a rejected deletion keeps its tab and reports failure', async () => {
    io.fileDelete.mockResolvedValueOnce(false);
    usePreviewStore.setState({ currentPreviewFiles: [tab('book')] });
    expect(await state().deleteFileFromCache('book', 'file.txt')).toBe(false);
    expect(state().currentPreviewFiles).toEqual([tab('book')]);
    expect(state().error).toBe('Failed to delete file from cache');
  });
});

describe('active file content commit ownership', () => {
  async function openFile() {
    io.fileRead.mockResolvedValueOnce(fileRecord('book'));
    await state().loadFileById('book::file.txt');
    io.fileRead.mockClear();
  }
  const committed = (content: string) => {
    const record = fileRecord('book');
    return {
      content,
      metadata: {
        ...record.metadata,
        size: new TextEncoder().encode(content).length,
        lastModified: '2026-10-19T00:00:00.000Z',
      },
    };
  };

  it('publishes committed UTF-8 size and timestamps rather than old view metadata', async () => {
    await openFile();
    const saved = committed('中文');
    io.fileRead.mockResolvedValueOnce(saved);
    const result = await state().updateActiveFileContent('中文');
    expect(io.fileUpdate).toHaveBeenCalledWith('book', 'file.txt', '中文');
    expect(io.fileSave).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: '中文',
      size: 6,
      lastModified: saved.metadata.lastModified,
    });
    expect(state().activeFile).toBe(result);
  });

  it('rejects a previous editor callback without writing into the newly selected file', async () => {
    await openFile();
    const originalId = state().activeFile!.id;
    io.fileRead.mockResolvedValueOnce(fileRecord('other'));
    const selected = await state().loadFileById('other::file.txt');
    io.fileRead.mockClear();
    expect(await state().updateActiveFileContent('old editor content', originalId)).toBeNull();
    expect(io.fileUpdate).not.toHaveBeenCalled();
    expect(io.fileRead).not.toHaveBeenCalled();
    expect(state().activeFile).toBe(selected);
  });

  it('a rejected editor callback cannot revoke an admitted save for the current file', async () => {
    await openFile();
    const write = deferred<boolean>();
    io.fileUpdate.mockReturnValueOnce(write.promise);
    const pending = state().updateActiveFileContent('current edit', 'book::file.txt');
    expect(await state().updateActiveFileContent('stale edit', 'other::file.txt')).toBeNull();
    io.fileRead.mockResolvedValueOnce(committed('current edit'));
    write.resolve(true);
    expect((await pending)?.content).toBe('current edit');
    expect(io.fileUpdate).toHaveBeenCalledOnce();
  });

  it('does not resurrect a deleted file through an upsert', async () => {
    await openFile();
    const original = state().activeFile;
    io.fileUpdate.mockResolvedValueOnce(false);
    expect(await state().updateActiveFileContent('obsolete')).toBeNull();
    expect(io.fileSave).not.toHaveBeenCalled();
    expect(io.fileRead).not.toHaveBeenCalled();
    expect(state().activeFile).toBe(original);
  });

  it('lets an admitted edit finish without reopening a closed file', async () => {
    await openFile();
    const write = deferred<boolean>();
    io.fileUpdate.mockReturnValueOnce(write.promise);
    const pending = state().updateActiveFileContent('edited');
    state().clearNotebookState();
    write.resolve(true);
    expect(await pending).toBeNull();
    expect(io.fileUpdate).toHaveBeenCalledOnce();
    expect(io.fileRead).not.toHaveBeenCalled();
    expect(state().activeFile).toBeNull();
  });

  it('ignores a late commit readback after a new file is selected', async () => {
    await openFile();
    const read = deferred<ReturnType<typeof committed>>();
    io.fileRead.mockReturnValueOnce(read.promise);
    const pending = state().updateActiveFileContent('edited');
    await vi.waitFor(() => expect(io.fileRead).toHaveBeenCalledOnce());
    io.fileRead.mockResolvedValueOnce(fileRecord('other'));
    const selected = await state().loadFileById('other::file.txt');
    read.resolve(committed('edited'));
    expect(await pending).toBeNull();
    expect(state().activeFile).toBe(selected);
  });

  it('publishes only the latest admitted edit when completions arrive out of order', async () => {
    await openFile();
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    io.fileUpdate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const old = state().updateActiveFileContent('first');
    const latest = state().updateActiveFileContent('second');
    io.fileRead.mockResolvedValueOnce(committed('second'));
    second.resolve(true);
    const result = await latest;
    first.resolve(true);
    expect(await old).toBeNull();
    expect(state().activeFile).toBe(result);
    expect(result?.content).toBe('second');
    expect(io.fileRead).toHaveBeenCalledOnce();
  });

  it('rejects write failure without altering the active record', async () => {
    await openFile();
    const original = state().activeFile;
    io.fileUpdate.mockRejectedValueOnce(new Error('write aborted'));
    await expect(state().updateActiveFileContent('edited')).rejects.toThrow('write aborted');
    expect(state().activeFile).toBe(original);
    expect(io.fileRead).not.toHaveBeenCalled();
  });

  it('a stale write failure cannot cancel a newer edit', async () => {
    await openFile();
    const write = deferred<boolean>();
    io.fileUpdate.mockReturnValueOnce(write.promise);
    const old = state().updateActiveFileContent('first');
    const rejected = expect(old).rejects.toThrow('old aborted');
    const read = deferred<ReturnType<typeof committed>>();
    io.fileRead.mockReturnValueOnce(read.promise);
    const latest = state().updateActiveFileContent('second');
    await vi.waitFor(() => expect(io.fileRead).toHaveBeenCalledOnce());
    write.reject(new Error('old aborted'));
    await rejected;
    read.resolve(committed('second'));
    expect((await latest)?.content).toBe('second');
    expect(state().activeFile?.content).toBe('second');
  });

  it('does not fabricate a record if the file disappears between write and readback', async () => {
    await openFile();
    io.fileRead.mockResolvedValueOnce(null);
    expect(await state().updateActiveFileContent('edited')).toBeNull();
    expect(io.fileSave).not.toHaveBeenCalled();
  });
});

describe.each(['previewFile', 'loadFileById'] as const)('%s complete cache hits', (entry) => {
  const open = () =>
    entry === 'previewFile'
      ? state().previewFile('book', 'file.txt')
      : state().loadFileById('book::file.txt');

  it.each(['metadata-only', 'missing-content', 'remote-snippet'])(
    'fetches %s records instead of presenting an empty or partial file',
    async (kind) => {
      const original = fileRecord('book');
      io.fileRead.mockResolvedValue({
        metadata: { ...original.metadata, hasLocalContent: kind === 'missing-content' },
        content: kind === 'remote-snippet' ? 'incomplete preview' : undefined,
        needsRemoteFetch: true,
      });
      io.fetch.mockResolvedValue({ status: 'ok', content: 'complete backend content' });
      const result = await open();
      expect(result?.content).toBe('complete backend content');
      expect(state().activeFile).toBe(result);
      expect(io.fileRead).toHaveBeenCalledOnce();
      expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', 'file.txt');
      expect(io.fileSave).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'complete backend content' })
      );
    }
  );

  it('treats a genuinely empty local file as a complete cache hit', async () => {
    io.fileRead.mockResolvedValue({ ...fileRecord('book'), content: '', needsRemoteFetch: false });
    const result = await open();
    expect(result?.content).toBe('');
    expect(state().activeFile).toBe(result);
    expect(io.fileRead).toHaveBeenCalledOnce();
    expect(io.fetch).not.toHaveBeenCalled();
    expect(io.fileSave).not.toHaveBeenCalled();
  });

  it('requires content even when a stale availability flag claims it is local', async () => {
    io.fileRead.mockResolvedValue({
      metadata: fileRecord('book').metadata,
      needsRemoteFetch: false,
    });
    io.fetch.mockResolvedValue({ status: 'ok', content: 'recovered body' });
    expect((await open())?.content).toBe('recovered body');
    expect(io.fetch).toHaveBeenCalledOnce();
  });

  it('cannot publish or cache a remote response after resetting the view', async () => {
    io.fileRead.mockResolvedValue({
      metadata: fileRecord('book').metadata,
      needsRemoteFetch: true,
    });
    const remote = deferred<{ status: string; content: string }>();
    io.fetch.mockReturnValueOnce(remote.promise);
    const pending = open();
    await vi.waitFor(() => expect(io.fetch).toHaveBeenCalledOnce());
    state().resetToNotebookMode();
    remote.resolve({ status: 'ok', content: 'obsolete remote content' });
    expect(await pending).toBe(entry === 'previewFile' ? undefined : null);
    expect(state().activeFile).toBeNull();
    expect(io.fileSave).not.toHaveBeenCalled();
  });
});

describe.each(['previewFile', 'loadFileById', 'previewFileInSplit'] as const)(
  '%s exact resource identity',
  (entry) => {
    const path = 'reports/账单 #1.txt';
    const open = () =>
      entry === 'loadFileById'
        ? state().loadFileById(`book::${path}`)
        : state()[entry]('book', path);
    const expectNoPublication = () => {
      expect(state().activeFile).toBeNull();
      expect(state().activeSplitFile).toBeNull();
      expect(state().currentPreviewFiles).toEqual([]);
      expect(io.fileSave).not.toHaveBeenCalled();
      expect(io.save).not.toHaveBeenCalled();
    };

    beforeEach(() => {
      io.read.mockResolvedValue(undefined);
    });

    it('passes the exact directory, Unicode, spaces and fragment character to the JSON API', async () => {
      const result = await open();
      expect(result?.path).toBe(path);
      expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', path);
    });

    it.each([403, 500])('never substitutes a basename after HTTP %s', async (status) => {
      io.fetch
        .mockRejectedValueOnce(new HttpResponseError(status, 'Failure', 'request failed'))
        .mockResolvedValue({ status: 'ok', content: 'WRONG FILE WITH SAME BASENAME' });
      const result = await open();
      expect(result).toBe(entry === 'loadFileById' ? null : undefined);
      expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', path);
      expect(state().error).toContain('request failed');
      expectNoPublication();
    });

    it('does not rewrite paths after an application-level failure', async () => {
      io.fetch
        .mockResolvedValueOnce({ status: 'error', message: 'permission denied' })
        .mockResolvedValue({ status: 'ok', content: 'WRONG FILE' });
      await open();
      expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', path);
      expect(state().error).toContain('permission denied');
      expectNoPublication();
    });

    it('does not infer a missing file from arbitrary message text', async () => {
      io.fetch.mockRejectedValueOnce(
        new HttpResponseError(
          500,
          'Internal Server Error',
          'upstream cache not found; incident 4042'
        )
      );
      await open();
      expect(state().error).toContain('incident 4042');
      expectNoPublication();
    });

    it('handles a genuine HTTP 404 without requesting another file', async () => {
      io.fetch.mockRejectedValueOnce(new HttpResponseError(404, 'Not Found', 'missing file'));
      await open();
      expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', path);
      if (entry === 'previewFileInSplit') expect(state().error).toContain('missing file');
      else expect(state().error).toBeNull();
      expectNoPublication();
    });
  }
);

describe.each(['cached', 'fetched'] as const)('%s preview activation', (source) => {
  beforeEach(() => {
    if (source === 'cached') io.fileRead.mockResolvedValue(fileRecord('book', 'new.txt'));
  });

  it('publishes the active file, renderer and matching tab in the same state', async () => {
    usePreviewStore.setState({ currentPreviewFiles: [tab('book', 'existing.txt')] });
    const observed: Array<{ id: string; tabIds: string[]; mode: string | null; loading: boolean }> =
      [];
    const unsubscribe = usePreviewStore.subscribe((next) => {
      if (next.activeFile)
        observed.push({
          id: next.activeFile.id,
          tabIds: next.currentPreviewFiles.map((file) => file.id),
          mode: next.activePreviewMode,
          loading: next.isLoading,
        });
    });
    try {
      await state().previewFile('book', 'new.txt');
      expect(observed.length).toBeGreaterThan(0);
      for (const snapshot of observed) {
        expect(snapshot.tabIds).toEqual(['book::existing.txt', snapshot.id]);
        expect(snapshot.mode).toBe('text');
        expect(snapshot.loading).toBe(false);
      }
      expect(io.tabSave).toHaveBeenCalledExactlyOnceWith(
        'book',
        [tab('book', 'existing.txt'), tab('book', 'new.txt')],
        'book::new.txt'
      );
    } finally {
      unsubscribe();
    }
  });

  it('updates an existing tab without moving it or duplicating it', async () => {
    usePreviewStore.setState({
      currentPreviewFiles: [
        tab('book', 'first.txt'),
        { ...tab('book', 'new.txt'), name: 'outdated' },
        tab('book', 'last.txt'),
      ],
    });
    const result = await state().previewFile('book', 'new.txt');
    expect(state().currentPreviewFiles).toEqual([
      tab('book', 'first.txt'),
      { ...tab('book', 'new.txt'), name: result?.name },
      tab('book', 'last.txt'),
    ]);
  });

  it('does not persist a replaced activation after a synchronous observer resets it', async () => {
    const unsubscribe = usePreviewStore.subscribe((next) => {
      if (next.activeFile) next.clearNotebookState();
    });
    try {
      expect(await state().previewFile('book', 'new.txt')).toBeUndefined();
      expect(io.tabSave).not.toHaveBeenCalled();
      expect(state().activeFile).toBeNull();
      expect(state().currentPreviewFiles).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});

describe('new preview cache record accounting', () => {
  it.each(['', 'ASCII', '中文', '🧪'])(
    'measures the stored representation of %j in both preview modes',
    async (content) => {
      io.read.mockResolvedValue(undefined);
      io.fetch.mockResolvedValue({ status: 'ok', content });
      const file = new File(['placeholder source with unrelated size'], 'file.txt');
      const expectedSize = new TextEncoder().encode(content).byteLength;
      const normal = await state().previewFile('book', 'file.txt', { file });
      const split = await state().previewFileInSplit('book', 'file.txt', { file });
      expect(normal?.size).toBe(expectedSize);
      expect(split?.size).toBe(expectedSize);
      expect(io.fileSave).toHaveBeenCalledWith(
        expect.objectContaining({ size: expectedSize, content })
      );
      expect(io.save).toHaveBeenCalledWith(
        'book',
        'file.txt',
        expect.objectContaining({ size: expectedSize, content })
      );
    }
  );

  it('sizes the converted binary renderer payload that is actually cached', async () => {
    io.read.mockResolvedValue(undefined);
    io.fetch.mockResolvedValue({ status: 'ok', content: 'aGVsbG8=' });
    const expectedContent = 'data:image/png;base64,aGVsbG8=';
    const expectedSize = new TextEncoder().encode(expectedContent).byteLength;
    const normal = await state().previewFile('book', 'image.png');
    const split = await state().previewFileInSplit('book', 'image.png');
    expect(normal).toMatchObject({ content: expectedContent, size: expectedSize });
    expect(split).toMatchObject({ content: expectedContent, size: expectedSize });
  });

  it('uses committed cache timestamps and access counters in the normal preview', async () => {
    const result = await state().previewFile('book', 'file.txt');
    expect(result).toMatchObject({ cachedAt: 101, accessCount: 2, lastAccessed: 102 });
    expect(state().activeFile).toBe(result);
  });
});

describe('tab persistence failures versus absence', () => {
  it('keeps current tabs and reports a read failure without default discovery', async () => {
    usePreviewStore.setState({ currentNotebookId: 'book', currentPreviewFiles: [tab('book')] });
    io.loadTabs.mockRejectedValueOnce(new Error('storage unavailable'));
    await state().loadTabState('book');
    expect(state().currentPreviewFiles).toEqual([tab('book')]);
    expect(state().error).toContain('storage unavailable');
    expect(state().isLoading).toBe(false);
    expect(io.defaults).not.toHaveBeenCalled();
    expect(io.tabSave).not.toHaveBeenCalled();
  });

  it.each([null, { tabs: [], activeTabId: null }])(
    'discovers defaults only for absent saved state: %j',
    async (saved) => {
      io.loadTabs.mockResolvedValueOnce(saved);
      await state().loadTabState('book');
      expect(io.defaults).toHaveBeenCalledTimes(saved === null ? 1 : 0);
      expect(state().error).toBeNull();
    }
  );

  it('ignores obsolete read failures after a new notebook load', async () => {
    const read = deferred<null>();
    io.loadTabs.mockReturnValueOnce(read.promise);
    const old = state().loadTabState('old');
    await state().loadTabState('new');
    read.reject(new Error('old read failed'));
    await old;
    expect(state().currentNotebookId).toBe('new');
    expect(state().error).toBeNull();
    expect(io.defaults).not.toHaveBeenCalled();
  });

  it('does not advance the preview notebook if saving outgoing tabs fails', async () => {
    usePreviewStore.setState({ currentNotebookId: 'old', currentPreviewFiles: [tab('old')] });
    io.tabSave.mockRejectedValueOnce(new Error('outgoing commit failed'));
    await state().switchToNotebook('new');
    expect(state().currentNotebookId).toBe('old');
    expect(state().currentPreviewFiles).toEqual([tab('old')]);
    expect(state().error).toContain('outgoing commit failed');
    expect(io.loadTabs).not.toHaveBeenCalled();
    expect(state().isLoading).toBe(false);
  });

  it('preserves the rejected save contract for explicit callers', async () => {
    const failure = new Error('commit failed');
    io.tabSave.mockRejectedValueOnce(failure);
    await expect(state().saveTabState('book')).rejects.toBe(failure);
  });

  it('handles the failure of a best-effort closed-tab snapshot', async () => {
    usePreviewStore.setState({ currentNotebookId: 'book', currentPreviewFiles: [tab('book')] });
    io.tabSave.mockRejectedValueOnce(new Error('close snapshot failed'));
    state().closePreviewFile('book::file.txt');
    await vi.waitFor(() => expect(io.tabSave).toHaveBeenCalledOnce());
    expect(state().currentPreviewFiles).toEqual([]);
  });
});

describe('restored file path identity', () => {
  it.each([
    ' report.txt',
    'report.txt ',
    ' folder/中文 #1.txt ',
    'folder/a::b.txt',
    'literal%2Fname.txt',
  ])('loads the exact stored key for %j', async (path) => {
    io.fileRead.mockResolvedValueOnce(fileRecord('book', path));
    const result = await state().loadFileById(`book::${path}`);
    expect(io.fileRead).toHaveBeenCalledExactlyOnceWith('book', path);
    expect(result?.id).toBe(`book::${path}`);
    expect(result?.path).toBe(path);
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it('keeps surrounding spaces when a restored file needs a backend fetch', async () => {
    const path = ' report.txt ';
    const result = await state().loadFileById(`book::${path}`);
    expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', path);
    expect(io.fileSave).toHaveBeenCalledWith(expect.objectContaining({ filePath: path }));
    expect(result?.path).toBe(path);
  });
});

it('keeps displayed tabs when default discovery cannot confirm an empty catalog', async () => {
  usePreviewStore.setState({ currentNotebookId: 'book', currentPreviewFiles: [tab('book')] });
  io.defaults.mockRejectedValueOnce(new Error('Unable to discover notebook files'));
  await state().loadNotebookTabs('book');
  expect(state().currentPreviewFiles).toEqual([tab('book')]);
  expect(state().error).toContain('Unable to discover notebook files');
  expect(state().isLoading).toBe(false);
  expect(io.tabSave).not.toHaveBeenCalled();
});

describe('split edit commit ownership', () => {
  const edit = (content: string, path = 'file.txt') =>
    state().updatePreviewFileContent(content, { surface: 'split', fileId: `book::${path}` });

  it('updates only the split cache and publishes committed metadata', async () => {
    io.fileRead.mockResolvedValueOnce(fileRecord('book'));
    const normal = await state().loadFileById('book::file.txt');
    await preview('file.txt');
    io.read.mockResolvedValueOnce({
      ...cached('file.txt'),
      content: '中文',
      size: 6,
      lastModified: 'committed',
    });
    expect(await edit('中文')).toMatchObject({
      content: '中文',
      size: 6,
      lastModified: 'committed',
    });
    expect(io.splitUpdate).toHaveBeenCalledWith('book', 'file.txt', '中文');
    expect(io.fileUpdate).not.toHaveBeenCalled();
    expect(io.save).not.toHaveBeenCalled();
    expect(state().activeFile).toBe(normal);
  });

  it('rejects stale file identity before admitting a split write', async () => {
    await preview('other.txt');
    expect(await edit('obsolete')).toBeNull();
    expect(io.splitUpdate).not.toHaveBeenCalled();
  });

  it('does not recreate deleted split files', async () => {
    await preview('file.txt');
    io.splitUpdate.mockResolvedValueOnce(false);
    expect(await edit('deleted')).toBeNull();
    expect(io.save).not.toHaveBeenCalled();
  });

  it('cannot reopen the split after it closes during an admitted write', async () => {
    await preview('file.txt');
    const write = deferred<boolean>();
    io.splitUpdate.mockReturnValueOnce(write.promise);
    const pending = edit('late');
    state().closeSplitPreview();
    write.resolve(true);
    expect(await pending).toBeNull();
    expect(state().activeSplitFile).toBeNull();
  });

  it('cannot publish old readback over a newly selected split file', async () => {
    await preview('file.txt');
    const read = deferred<ReturnType<typeof cached>>();
    io.read.mockReturnValueOnce(read.promise);
    const pending = edit('late');
    await vi.waitFor(() => expect(io.splitUpdate).toHaveBeenCalledOnce());
    const next = await preview('other.txt');
    read.resolve({ ...cached('file.txt'), content: 'late' });
    expect(await pending).toBeNull();
    expect(state().activeSplitFile).toBe(next);
  });

  it('normal navigation does not revoke a split save', async () => {
    await preview('file.txt');
    const write = deferred<boolean>();
    io.splitUpdate.mockReturnValueOnce(write.promise);
    const pending = edit('split edit');
    io.fileRead.mockResolvedValueOnce(fileRecord('book'));
    await state().loadFileById('book::file.txt');
    io.read.mockResolvedValueOnce({ ...cached('file.txt'), content: 'split edit' });
    write.resolve(true);
    expect((await pending)?.content).toBe('split edit');
  });

  it('propagates failed commits without changing the displayed split content', async () => {
    const original = await preview('file.txt');
    io.splitUpdate.mockRejectedValueOnce(new Error('aborted'));
    await expect(edit('failed')).rejects.toThrow('aborted');
    expect(state().activeSplitFile).toBe(original);
  });
});

describe('preview metadata admission', () => {
  it.each(['normal', 'split'] as const)(
    'accepts file-tree descriptors and captures metadata before %s I/O',
    async (surface) => {
      const read = deferred<undefined>();
      if (surface === 'normal') io.fileRead.mockReturnValueOnce(read.promise);
      else io.read.mockReturnValueOnce(read.promise);
      const metadata = {
        file: { name: 'Selected.txt', path: 'folder/file.txt', type: 'file' },
        lastModified: '2026-01-02T00:00:00.000Z',
      };
      const open = surface === 'normal' ? state().previewFile : state().previewFileInSplit;
      const pending = open('book', 'folder/file.txt', metadata);
      metadata.file.name = 'Changed.txt';
      metadata.lastModified = '2026-02-02T00:00:00.000Z';
      read.resolve(undefined);
      const result = await pending;
      expect(result).toMatchObject({
        name: 'Selected.txt',
        path: 'folder/file.txt',
        lastModified: '2026-01-02T00:00:00.000Z',
      });
      expect(io.fetch).toHaveBeenCalledExactlyOnceWith('book', 'folder/file.txt');
    }
  );

  it('derives display names without constructing browser File objects', async () => {
    io.read.mockResolvedValue(undefined);
    vi.stubGlobal('File', undefined);
    try {
      expect(await state().previewFile('book', 'folder/file.txt')).toMatchObject({
        name: 'file.txt',
      });
      expect(await state().previewFileInSplit('book', 'folder/other.txt')).toMatchObject({
        name: 'other.txt',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
