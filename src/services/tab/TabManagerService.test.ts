import { beforeEach, expect, it, vi } from 'vitest';
import { tabManagerService } from './TabManagerService';
import { TabDiscoveryError } from './TabDiscoveryError';

const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), files: vi.fn(), remote: vi.fn() }));
vi.mock('@Services/persistence/instance', () => ({
  persistenceService: {
    tabs: { getTabState: io.read, saveTabState: io.write },
    files: { getFilesForNotebook: io.files },
  },
}));
vi.mock('@Services/notebook/FileService', () => ({ FileService: { listFiles: io.remote } }));
const own = { id: 'book::a.txt', path: 'a.txt', name: 'a.txt', type: 'text' as const };
const foreign = { ...own, id: 'other::a.txt' };
beforeEach(() => {
  vi.resetAllMocks();
  io.files.mockResolvedValue([]);
  io.remote.mockResolvedValue({ status: 'ok', files: [] });
});

it('distinguishes confirmed absence from a failed read', async () => {
  io.read.mockResolvedValueOnce(null);
  expect(await tabManagerService.loadTabs('book')).toBeNull();
  const failure = new Error('read transaction failed');
  io.read.mockRejectedValueOnce(failure);
  await expect(tabManagerService.loadTabs('book')).rejects.toBe(failure);
});

it('preserves an explicitly saved empty tab list', async () => {
  io.read.mockResolvedValueOnce({ tabList: [], activeTabId: null });
  expect(await tabManagerService.loadTabs('book')).toEqual({ tabs: [], activeTabId: null });
});

it.each(['book::a.txt', 'book::missing.txt', 'other::a.txt', null])(
  'enforces active membership for %s on both read and write',
  async (activeTabId) => {
    const expected = activeTabId === own.id ? own.id : null;
    io.read.mockResolvedValueOnce({ tabList: [own, foreign], activeTabId });
    expect(await tabManagerService.loadTabs('book')).toEqual({
      tabs: [own],
      activeTabId: expected,
    });
    await tabManagerService.saveTabs('book', [own, foreign], activeTabId);
    expect(io.write).toHaveBeenCalledExactlyOnceWith('book', [own], expected);
  }
);

it('propagates save failures unchanged', async () => {
  const failure = new Error('commit failed');
  io.write.mockRejectedValueOnce(failure);
  await expect(tabManagerService.saveTabs('book', [own], own.id)).rejects.toBe(failure);
});

it('clears through the same committed save contract', async () => {
  await tabManagerService.clearTabs('book');
  expect(io.write).toHaveBeenCalledExactlyOnceWith('book', [], null);
  const failure = new Error('clear commit failed');
  io.write.mockRejectedValueOnce(failure);
  await expect(tabManagerService.clearTabs('book')).rejects.toBe(failure);
});

const cached = (path: string, name = path, notebookId = 'book') => ({
  metadata: { notebookId, filePath: path, fileName: name },
});

it('queries both independent sources and confirms an empty catalog', async () => {
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([]);
  expect(io.files).toHaveBeenCalledExactlyOnceWith('book', false);
  expect(io.remote).toHaveBeenCalledExactlyOnceWith('book');
});

it('uses backend files even when the local repository fails', async () => {
  io.files.mockRejectedValueOnce(new Error('cache unavailable'));
  io.remote.mockResolvedValueOnce({ status: 'ok', files: [{ name: 'remote.txt' }] });
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([
    { id: 'book::remote.txt', path: 'remote.txt', name: 'remote.txt', type: 'text' },
  ]);
});

it('retains useful cached tabs while offline', async () => {
  io.files.mockResolvedValueOnce([cached('a.txt')]);
  io.remote.mockRejectedValueOnce(new Error('offline'));
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([own]);
});

it.each(['cache', 'backend', 'both'])(
  'rejects unavailable empty discovery when %s fails',
  async (source) => {
    if (source !== 'backend') io.files.mockRejectedValueOnce(new Error('cache unavailable'));
    if (source !== 'cache') io.remote.mockRejectedValueOnce(new Error('offline'));
    await expect(tabManagerService.loadDefaultTabs('book')).rejects.toBeInstanceOf(
      TabDiscoveryError
    );
    expect(io.files).toHaveBeenCalledOnce();
    expect(io.remote).toHaveBeenCalledOnce();
  }
);

it.each([
  { status: 'error', message: 'denied' },
  { status: 'ok' },
  { status: 'ok', files: 'invalid' },
])('does not count invalid backend response %j as confirmed empty', async (response) => {
  io.remote.mockResolvedValueOnce(response);
  await expect(tabManagerService.loadDefaultTabs('book')).rejects.toThrow(
    'Unable to discover notebook files'
  );
});

it('keeps cached precedence and deduplicates stable paths across sources', async () => {
  io.files.mockResolvedValueOnce([
    cached('a.txt', 'cached label'),
    cached('a.txt', 'duplicate label'),
  ]);
  io.remote.mockResolvedValueOnce({
    status: 'ok',
    files: [{ name: 'remote label', path: 'a.txt' }, { name: 'b.txt' }],
  });
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([
    { ...own, name: 'cached label' },
    { id: 'book::b.txt', name: 'b.txt', path: 'b.txt', type: 'text' },
  ]);
});

it('derives missing child paths from directories while preserving explicit paths', async () => {
  io.remote.mockResolvedValueOnce({
    status: 'ok',
    files: [
      { name: 'left', type: 'directory', children: [{ name: 'same.txt' }] },
      {
        name: 'right',
        type: 'directory',
        children: [{ name: 'same.txt' }, { name: 'label', path: ' explicit/path.txt ' }],
      },
      { name: 'empty', type: 'directory' },
    ],
  });
  const tabs = await tabManagerService.loadDefaultTabs('book');
  expect(tabs.map((tab) => tab.path)).toEqual([
    'left/same.txt',
    'right/same.txt',
    ' explicit/path.txt ',
  ]);
  expect(tabs.map((tab) => tab.id)).toEqual([
    'book::left/same.txt',
    'book::right/same.txt',
    'book:: explicit/path.txt ',
  ]);
});

it('does not leak partially parsed remote entries after a malformed sibling', async () => {
  io.files.mockResolvedValueOnce([cached('a.txt')]);
  io.remote.mockResolvedValueOnce({ status: 'ok', files: [{ name: 'partial.txt' }, null] });
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([own]);
});

it('applies the same exclusion rules to both sources and rejects foreign cached ownership', async () => {
  const paths = ['notebook_main.json', 'book.easynb', '.hidden.txt', 'temp.tmp', 'cells/old.txt'];
  io.files.mockResolvedValueOnce([
    ...paths.map((path) => cached(path)),
    cached('foreign.txt', 'foreign.txt', 'other'),
    cached('a.txt'),
  ]);
  io.remote.mockResolvedValueOnce({
    status: 'ok',
    files: paths.map((path) => ({ path, name: path })),
  });
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([own]);
});

it('starts backend discovery before a pending cache read finishes', async () => {
  let release!: (value: unknown[]) => void;
  io.files.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const pending = tabManagerService.loadDefaultTabs('book');
  expect(io.remote).toHaveBeenCalledOnce();
  release([]);
  await expect(pending).resolves.toEqual([]);
});

it('retains source-specific failures when neither source is usable', async () => {
  const cacheFailure = new Error('local database closed');
  const remoteFailure = new Error('network unavailable');
  io.files.mockRejectedValueOnce(cacheFailure);
  io.remote.mockRejectedValueOnce(remoteFailure);
  await expect(tabManagerService.loadDefaultTabs('book')).rejects.toMatchObject({
    name: 'TabDiscoveryError',
    failures: [
      { source: 'cache', cause: cacheFailure },
      { source: 'backend', cause: remoteFailure },
    ],
  });
});

it.each([
  ['cache', 'assets/photo.png', 'image'],
  ['backend', 'assets/photo.png', 'image'],
  ['cache', 'diagram.SVG', 'image'],
  ['backend', 'diagram.SVG', 'image'],
  ['cache', 'photo-notes.md', 'markdown'],
  ['backend', 'photo-notes.md', 'markdown'],
  ['cache', 'Image-analysis.txt', 'text'],
  ['backend', 'Image-analysis.txt', 'text'],
  ['cache', 'Screenshot-log.txt', 'text'],
  ['backend', 'Screenshot-log.txt', 'text'],
])('retains %s metadata for %s without requiring its file body', async (source, path, type) => {
  if (source === 'cache') io.files.mockResolvedValueOnce([cached(path)]);
  else io.remote.mockResolvedValueOnce({ status: 'ok', files: [{ name: path, path }] });
  expect(await tabManagerService.loadDefaultTabs('book')).toEqual([
    { id: `book::${path}`, path, name: path, type },
  ]);
  expect(io.files).toHaveBeenCalledExactlyOnceWith('book', false);
});
