import { expect, it, vi } from 'vitest';
import { FileRecordSet } from './FileRecordSet';

it('prepares a consistent metadata/body pair before entering a caller-owned transaction', () => {
  const data = {
    notebookId: 'book',
    filePath: 'notebook_book.json',
    fileName: 'Title.easynb',
    content: '{"cells":[]}',
    size: 12,
    lastModified: '2026-09-20T00:00:00Z',
  };
  const records = new FileRecordSet(data, { forceLocal: true });
  expect(records.metadata).toMatchObject({
    id: 'book::notebook_book.json',
    notebookId: 'book',
    filePath: data.filePath,
    fileName: data.fileName,
    fileType: 'json',
    size: 12,
    lastModified: data.lastModified,
    accessCount: 1,
    storageType: 'local',
    hasLocalContent: true,
  });
  expect(records.metadata.cachedAt).toBe(records.metadata.lastAccessedAt);
  expect(records.content).toEqual({
    fileId: records.metadata.id,
    content: data.content,
    compressed: false,
    encoding: 'utf8',
  });
  const metadata = { put: vi.fn() };
  const content = { put: vi.fn(), delete: vi.fn() };
  records.writeTo(metadata as unknown as IDBObjectStore, content as unknown as IDBObjectStore);
  expect(metadata.put).toHaveBeenCalledExactlyOnceWith(records.metadata);
  expect(content.put).toHaveBeenCalledExactlyOnceWith(records.content);
  expect(content.delete).not.toHaveBeenCalled();
});

it('prepares bounded preview metadata and an eviction for remote-only storage', () => {
  const records = new FileRecordSet(
    {
      notebookId: 'book',
      filePath: 'large.txt',
      fileName: 'large.txt',
      content: 'x'.repeat(1000),
      size: 1000,
      lastModified: '2026-09-20',
      remoteUrl: '/remote/large.txt',
    },
    { maxFileSize: 100 }
  );
  expect(records.metadata.contentPreview).toHaveLength(500);
  expect(records.content).toBeUndefined();
  const metadata = { put: vi.fn() };
  const content = { put: vi.fn(), delete: vi.fn() };
  records.writeTo(metadata as unknown as IDBObjectStore, content as unknown as IDBObjectStore);
  expect(content.put).not.toHaveBeenCalled();
  expect(content.delete).toHaveBeenCalledExactlyOnceWith(records.metadata.id);
});

it('rebuilds local storage state without changing the prior revision or access history', () => {
  const remote = new FileRecordSet(
    {
      notebookId: 'book',
      filePath: 'file',
      fileName: 'file',
      content: 'remote preview',
      size: 100,
      remoteUrl: '/remote/file',
      lastModified: 'old',
    },
    { maxFileSize: 10 }
  );
  remote.metadata.cachedAt = 17;
  remote.metadata.accessCount = 9;
  const local = FileRecordSet.localUpdate(remote.metadata, '你好');
  expect(local.metadata).toMatchObject({
    storageType: 'local',
    hasLocalContent: true,
    isLargeFile: false,
    contentPreview: undefined,
    size: 6,
    cachedAt: 17,
    accessCount: 9,
    remoteUrl: '/remote/file',
  });
  expect(local.content?.content).toBe('你好');
  expect(remote.metadata).toMatchObject({
    storageType: 'remote',
    isLargeFile: true,
    contentPreview: 'remote preview',
    size: 100,
  });
});

it.each([
  ['', 'file'],
  ['book', ''],
  [42, 'file'],
  ['book', 42],
])('rejects malformed prepared ownership %j/%j', (notebookId, filePath) => {
  expect(
    () =>
      new FileRecordSet({
        notebookId: notebookId as string,
        filePath: filePath as string,
        fileName: 'file',
        content: '',
        size: 0,
        lastModified: 'old',
      })
  ).toThrow();
});
