import { beforeEach, expect, it, vi } from 'vitest';
import { TabRepository } from './TabRepository';
import type { IStorageProvider } from '../interfaces';
import { DB_STORES, type TabEntry } from '../../../storage/schema';

const put = vi.fn();
const repository = new TabRepository({ put } as unknown as IStorageProvider);
const tab = (path = 'file.txt'): TabEntry => ({
  id: `book::${path}`,
  path,
  name: path,
  type: 'text',
});
beforeEach(() => {
  vi.resetAllMocks();
});

it('captures a valid ordered list without retaining caller-owned entries', async () => {
  const first = tab(' first.txt ');
  const second = tab('second.txt');
  const list = [first, second];
  const saving = repository.saveTabState('book', list, second.id);
  first.name = 'changed after admission';
  list.reverse();
  await saving;
  expect(put).toHaveBeenCalledExactlyOnceWith(DB_STORES.TAB_STATES, {
    notebookId: 'book',
    tabList: [tab(' first.txt '), tab('second.txt')],
    activeTabId: 'book::second.txt',
    lastUpdated: expect.any(Number),
  });
});

it('accepts an empty list with no active selection', async () => {
  await repository.saveTabState('book', [], null);
  expect(put).toHaveBeenCalledWith(
    DB_STORES.TAB_STATES,
    expect.objectContaining({ tabList: [], activeTabId: null })
  );
});

it.each([
  [{ ...tab(), id: 'other::file.txt' }],
  [{ ...tab(), path: 'different.txt' }],
  [tab(), tab()],
  [{ ...tab(), name: '' }],
  [{ ...tab(), type: '' }],
  [{ ...tab(), path: '' }],
])('rejects inconsistent entries before persistence: %j', async (...entries) => {
  await expect(repository.saveTabState('book', entries, null)).rejects.toThrow('Invalid tab entry');
  expect(put).not.toHaveBeenCalled();
});

it.each(['other::file.txt', 'book::missing.txt', undefined])(
  'rejects dangling or invalid active selection %s',
  async (active) => {
    await expect(repository.saveTabState('book', [tab()], active as string)).rejects.toThrow(
      'Invalid active tab'
    );
    expect(put).not.toHaveBeenCalled();
  }
);

it('rejects malformed JavaScript entries before persistence', async () => {
  await expect(
    repository.saveTabState('book', [null] as unknown as TabEntry[], null)
  ).rejects.toThrow('Invalid tab entry');
  await expect(repository.saveTabState('book', {} as unknown as TabEntry[], null)).rejects.toThrow(
    'Invalid notebook identity or tab list'
  );
  expect(put).not.toHaveBeenCalled();
});

it('propagates commit failure to the caller', async () => {
  const error = new Error('commit aborted');
  put.mockRejectedValueOnce(error);
  await expect(repository.saveTabState('book', [tab()], null)).rejects.toBe(error);
});
