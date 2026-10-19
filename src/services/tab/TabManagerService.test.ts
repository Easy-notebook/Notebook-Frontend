import { beforeEach, expect, it, vi } from 'vitest';
import { tabManagerService } from './TabManagerService';

const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@Services/persistence/instance', () => ({
  persistenceService: { tabs: { getTabState: io.read, saveTabState: io.write } },
}));
const own = { id: 'book::a.txt', path: 'a.txt', name: 'a.txt', type: 'text' as const };
const foreign = { ...own, id: 'other::a.txt' };
beforeEach(() => {
  vi.resetAllMocks();
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
