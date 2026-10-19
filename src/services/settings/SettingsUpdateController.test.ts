import { expect, it, vi } from 'vitest';
import type { Settings } from '@Store/models/settings';
import { SettingsUpdateController } from './SettingsUpdateController';

const settings = { language: 'zh' } as Settings;

it('reports asynchronous persistence failure once and preserves rejection for awaiting callers', async () => {
  const failure = new Error('storage full');
  const persist = vi.fn().mockRejectedValue(failure);
  const report = vi.fn();
  const updates = new SettingsUpdateController(() => settings, persist, report);
  await expect(updates.update((state) => ({ ...state, language: 'en' }))).rejects.toBe(failure);
  expect(report.mock.calls).toEqual([[null], ['storage full']]);
  expect(persist).toHaveBeenCalledTimes(1);
});

it('keeps synchronous validation errors synchronous without attempting persistence', () => {
  const persist = vi.fn();
  const report = vi.fn();
  const updates = new SettingsUpdateController(() => settings, persist, report);
  expect(() =>
    updates.update(() => {
      throw new Error('invalid');
    })
  ).toThrow('invalid');
  expect(report).toHaveBeenCalledWith('invalid');
  expect(persist).not.toHaveBeenCalled();
});

it('ignores a superseded asynchronous failure and allows subsequent updates', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_, fail) => {
    reject = fail;
  });
  const persist = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
  const report = vi.fn();
  const updates = new SettingsUpdateController(() => settings, persist, report);
  const first = updates.update((state) => state);
  await updates.update((state) => ({ ...state, language: 'en' }));
  reject(new Error('old failure'));
  await expect(first).rejects.toThrow('old failure');
  expect(report.mock.calls).toEqual([[null], [null]]);
  await updates.update((state) => state);
  expect(persist).toHaveBeenCalledTimes(3);
});
