import { beforeEach, expect, it, vi } from 'vitest';
import { SplitFileRepository } from './SplitFileRepository';
import type { IStorageProvider, SplitFileSaveData } from '../interfaces';
import { DB_STORES } from '../../../storage/schema';

const put = vi.fn();
const repository = new SplitFileRepository({ put } as unknown as IStorageProvider);
const valid = (): SplitFileSaveData => ({
  name: 'file.txt',
  content: '中文',
  type: 'text',
  size: 6,
  lastModified: '2026-10-19',
  metadata: { label: 'custom' },
});
beforeEach(() => {
  vi.resetAllMocks();
});

it('preserves the public record shape, exact identity and supplied metadata', async () => {
  const data = valid();
  await repository.saveFile('book', ' file.txt ', data);
  expect(put).toHaveBeenCalledExactlyOnceWith(DB_STORES.SPLIT_FILES, {
    id: 'book:: file.txt ',
    notebookId: 'book',
    filePath: ' file.txt ',
    fileName: data.name,
    content: data.content,
    type: data.type,
    size: data.size,
    lastModified: data.lastModified,
    metadata: data.metadata,
    cachedAt: expect.any(Number),
  });
});

it('accepts an intentionally empty file with zero size', async () => {
  await repository.saveFile('book', 'empty.txt', { ...valid(), content: '', size: 0 });
  expect(put).toHaveBeenCalledWith(
    DB_STORES.SPLIT_FILES,
    expect.objectContaining({ content: '', size: 0 })
  );
});

it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid size %s before writing',
  async (size) => {
    await expect(repository.saveFile('book', 'file.txt', { ...valid(), size })).rejects.toThrow(
      'Invalid split file size'
    );
    expect(put).not.toHaveBeenCalled();
  }
);

it.each([
  ['name', ''],
  ['name', 42],
  ['content', undefined],
  ['content', {}],
  ['type', ''],
  ['type', null],
  ['lastModified', ''],
  ['lastModified', 42],
])('rejects malformed %s before writing', async (field, value) => {
  const data = { ...valid(), [field]: value } as unknown as SplitFileSaveData;
  await expect(repository.saveFile('book', 'file.txt', data)).rejects.toThrow('Invalid split file');
  expect(put).not.toHaveBeenCalled();
});

it.each([
  ['', 'file.txt'],
  ['book', ''],
])('rejects incomplete identity %j/%j', async (notebookId, path) => {
  await expect(repository.saveFile(notebookId, path, valid())).rejects.toThrow(
    'Invalid split file'
  );
  expect(put).not.toHaveBeenCalled();
});

it('reports storage commit failure instead of accepting the record', async () => {
  const error = new Error('write aborted');
  put.mockRejectedValueOnce(error);
  await expect(repository.saveFile('book', 'file.txt', valid())).rejects.toBe(error);
});
