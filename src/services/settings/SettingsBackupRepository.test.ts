import { initialSettings } from './SettingsDefaults';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsBackupRepository } from './SettingsBackupRepository';
import { SettingsPersistenceStorage } from './SettingsPersistenceStorage';
import type { SettingsWithTimestamp } from '@Store/models/settings';

beforeEach(() => localStorage.clear());

it('recovers an older decryptable candidate without deleting malformed or unreadable backups', async () => {
  localStorage.setItem('backup-1', JSON.stringify({ ...initialSettings, apiKey: 'valid' }));
  localStorage.setItem('backup-2', JSON.stringify({ ...initialSettings, apiKey: 'broken' }));
  localStorage.setItem('backup-3', '{broken');
  const report = vi.fn();
  const backups = new SettingsBackupRepository(() => localStorage, 'backup', report);
  const storage = new SettingsPersistenceStorage({
    storage: () => localStorage,
    version: 2,
    readBackup: (decode) => backups.restore(decode),
    writeBackup: (settings) => backups.create(settings),
    pruneBackups: () => backups.prune(),
    decrypt: async (text) => {
      if (text !== 'valid') throw new Error('invalid cipher');
      return 'plaintext';
    },
  });
  expect(await storage.getItem('primary')).toEqual({
    version: 2,
    state: { settings: { ...initialSettings, apiKey: 'plaintext' } },
  });
  expect(report).toHaveBeenCalledTimes(2);
  expect(localStorage.length).toBe(3);
  expect(localStorage.getItem('primary')).toBeNull();
});

it('keeps two distinct newest backups despite equal or decreasing clocks and ignores foreign keys', async () => {
  const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(10).mockReturnValueOnce(5);
  const backups = new SettingsBackupRepository(() => localStorage, 'backup', vi.fn(), now);
  localStorage.setItem('foreign-backup-999', 'keep');
  localStorage.setItem('backup-invalid', 'keep');
  const settings = { apiKey: '' } as SettingsWithTimestamp;
  await backups.create(settings);
  await backups.create(settings);
  await backups.create(settings);
  expect(Object.keys(localStorage).sort()).toEqual([
    'backup-11',
    'backup-12',
    'backup-invalid',
    'foreign-backup-999',
  ]);
});

it('reports unusable candidates and returns null only after exhausting recovery copies', async () => {
  localStorage.setItem('backup-1', 'null');
  localStorage.setItem('backup-2', '{}');
  const report = vi.fn();
  const backups = new SettingsBackupRepository(() => localStorage, 'backup', report);
  const decode = vi.fn().mockRejectedValue(new Error('invalid settings'));
  expect(await backups.restore(decode)).toBeNull();
  expect(decode).toHaveBeenCalledTimes(2);
  expect(report).toHaveBeenCalledTimes(2);
});
