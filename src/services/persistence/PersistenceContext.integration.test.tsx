import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  initialize: vi.fn(),
  close: vi.fn(),
  maintenance: { ensureConfig: vi.fn(), getConfig: vi.fn(), cleanup: vi.fn() },
}));
vi.mock('./instance', () => ({ persistenceService: service }));
vi.mock('../../storage/migration', () => ({
  DataMigration: { isMigrationNeeded: vi.fn(async () => false) },
}));
import { PersistenceProvider } from './PersistenceContext';
import { StorageManager } from '../../storage/storageManager';
import { DEFAULT_STORAGE_CONFIG } from '../../storage/schema';

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  service.initialize.mockResolvedValue(undefined);
  service.close.mockResolvedValue(undefined);
  service.maintenance.ensureConfig.mockResolvedValue(undefined);
  service.maintenance.getConfig.mockResolvedValue({ ...DEFAULT_STORAGE_CONFIG });
  service.maintenance.cleanup.mockResolvedValue({
    notebooksDeleted: 0,
    filesDeleted: 0,
    bytesFreed: 0,
    duration: 0,
  });
});
afterEach(async () => {
  cleanup();
  await StorageManager.close();
  vi.useRealTimers();
});

it('the application owner initializes configuration and cancels its sole maintenance timer on unmount', async () => {
  const view = render(
    <StrictMode>
      <PersistenceProvider>
        <div>Application ready</div>
      </PersistenceProvider>
    </StrictMode>
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText('Application ready')).toBeInTheDocument();
  expect(service.initialize).toHaveBeenCalledTimes(1);
  expect(service.maintenance.ensureConfig).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  });
  expect(service.maintenance.cleanup).toHaveBeenCalledTimes(1);
  const closes = service.close.mock.calls.length;
  view.unmount();
  await act(async () => {
    await StorageManager.close();
  });
  expect(service.close).toHaveBeenCalledTimes(closes + 1);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(service.maintenance.cleanup).toHaveBeenCalledTimes(1);
});
