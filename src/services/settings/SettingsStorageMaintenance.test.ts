import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsStorageMaintenance } from './SettingsStorageMaintenance';
beforeEach(() => localStorage.clear());

it('supports detached public methods and treats zero usage as a valid estimate', async () => {
  const storage = vi.fn(() => localStorage);
  const service = new SettingsStorageMaintenance({
    storage,
    estimate: async () => ({ quota: 1024, usage: 0 }),
    report: vi.fn(),
  });
  const { checkStorageSpace, getStorageEstimate } = service;
  expect(await checkStorageSpace()).toBe(false);
  expect(await getStorageEstimate()).toEqual({ quota: 1024, usage: 0 });
  expect(storage).not.toHaveBeenCalled();
});

it.each([null, 'existing probe data'])(
  'restores the pre-check probe record: %s',
  async (previous) => {
    if (previous !== null) localStorage.setItem('!!testQuota', previous);
    const service = new SettingsStorageMaintenance({
      storage: () => localStorage,
      estimate: async () => null,
      report: vi.fn(),
    });
    expect(await service.checkStorageSpace()).toBe(true);
    expect(localStorage.getItem('!!testQuota')).toBe(previous);
  }
);

it('reports failed checks without throwing through the boolean public interface', async () => {
  const report = vi.fn();
  const service = new SettingsStorageMaintenance({
    storage: () => localStorage,
    estimate: async () => {
      throw new Error('denied');
    },
    report,
  });
  expect(await service.checkStorageSpace()).toBe(false);
  expect(report).toHaveBeenCalledWith('Storage space check failed', expect.any(Error));
});

it('keeps settings and foreign keys while explicitly cleaning oldest least-important application records', async () => {
  localStorage.setItem('easy-notebook-settings', 'keep');
  localStorage.setItem('foreign', 'keep');
  localStorage.setItem('easy-notebook-newer', JSON.stringify({ importance: 2, timestamp: 2 }));
  localStorage.setItem(
    'easy-notebook-older',
    JSON.stringify({ importance: 1, timestamp: 1, content: 'x'.repeat(1024 * 1024) })
  );
  const service = new SettingsStorageMaintenance({
    storage: () => localStorage,
    estimate: async () => null,
    report: vi.fn(),
  });
  const { cleanupStorage } = service;
  expect(await cleanupStorage()).toBe(true);
  expect(localStorage.getItem('easy-notebook-older')).toBeNull();
  expect(localStorage.getItem('easy-notebook-newer')).not.toBeNull();
  expect(localStorage.getItem('easy-notebook-settings')).toBe('keep');
  expect(localStorage.getItem('foreign')).toBe('keep');
});
