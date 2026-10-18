import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STORAGE_CONFIG } from './schema';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  getConfig: vi.fn(),
  ensureConfig: vi.fn(async () => {}),
  updateConfig: vi.fn(async () => {}),
  cleanupActivities: vi.fn(async () => {}),
  getInactiveNotebooks: vi.fn(async () => []),
  getAllNotebooks: vi.fn(async () => []),
}));
vi.mock('../services/persistence/instance', () => ({
  persistenceService: {
    initialize: mocks.initialize,
    close: mocks.close,
    maintenance: {
      getConfig: mocks.getConfig,
      ensureConfig: mocks.ensureConfig,
      updateConfig: mocks.updateConfig,
      cleanupActivities: mocks.cleanupActivities,
    },
    notebooks: {
      getInactiveNotebooks: mocks.getInactiveNotebooks,
      getAllNotebooks: mocks.getAllNotebooks,
    },
  },
}));
vi.mock('./migration', () => ({ DataMigration: { isMigrationNeeded: vi.fn(async () => false) } }));
import { StorageManager } from './storageManager';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.getConfig.mockResolvedValue({ ...DEFAULT_STORAGE_CONFIG });
  await StorageManager.initialize();
});
afterEach(async () => {
  await StorageManager.close();
  vi.useRealTimers();
});

describe('StorageManager lifecycle integration', () => {
  it('drains accepted cleanup through its final config write before closing', async () => {
    let resolve!: (value: typeof DEFAULT_STORAGE_CONFIG) => void;
    mocks.getConfig.mockReturnValueOnce(
      new Promise((accept) => {
        resolve = accept;
      })
    );
    const cleanup = StorageManager.cleanupStorage();
    await Promise.resolve();
    const closing = StorageManager.close();
    await expect(StorageManager.updateConfig({ maxNotebooks: 4 })).rejects.toThrow('closed');
    expect(mocks.close).not.toHaveBeenCalled();
    resolve({ ...DEFAULT_STORAGE_CONFIG });
    await Promise.all([cleanup, closing]);
    expect(mocks.cleanupActivities).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).toHaveBeenCalledWith({ lastCleanup: expect.any(Number) });
    expect(mocks.updateConfig.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.close.mock.invocationCallOrder[0]
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not select deletion candidates when maintenance configuration cannot be read', async () => {
    mocks.getConfig.mockRejectedValue(new Error('config unavailable'));
    await expect(StorageManager.cleanupStorage()).rejects.toThrow('config unavailable');
    await expect(StorageManager.emergencyCleanup()).rejects.toThrow('config unavailable');
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mocks.getInactiveNotebooks).not.toHaveBeenCalled();
    expect(mocks.getAllNotebooks).not.toHaveBeenCalled();
    expect(mocks.cleanupActivities).not.toHaveBeenCalled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    // Optional configuration display retains its existing default behavior.
    await expect(StorageManager.getConfig()).resolves.toEqual(DEFAULT_STORAGE_CONFIG);
  });

  it('stops scheduled access on close and resumes only after explicit initialization', async () => {
    await StorageManager.close();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(mocks.getConfig).not.toHaveBeenCalled();
    await StorageManager.initialize();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mocks.cleanupActivities).toHaveBeenCalledTimes(1);
  });
});
