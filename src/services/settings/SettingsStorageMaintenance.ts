import type { StorageEstimate, StorageItem } from '@Store/models/settings';

interface MaintenanceDependencies {
  storage: () => Storage;
  estimate: () => Promise<StorageEstimate | null>;
  report: (message: string, error: unknown) => void;
}

const finiteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Explicit storage maintenance; never invoked by automatic settings persistence. */
export class SettingsStorageMaintenance {
  constructor(private readonly dependencies: MaintenanceDependencies) {}

  readonly getStorageEstimate = (): Promise<StorageEstimate | null> => this.dependencies.estimate();

  readonly checkStorageSpace = async (): Promise<boolean> => {
    try {
      const estimate = await this.getStorageEstimate();
      if (estimate && typeof estimate.quota === 'number' && typeof estimate.usage === 'number')
        return estimate.quota - estimate.usage > 1024 * 50;

      const storage = this.dependencies.storage();
      const key = '!!testQuota';
      const previous = storage.getItem(key);
      storage.setItem(key, 'x'.repeat(1024));
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
      return true;
    } catch (error) {
      this.dependencies.report('Storage space check failed', error);
      return false;
    }
  };

  readonly cleanupStorage = async (): Promise<boolean> => {
    try {
      const storage = this.dependencies.storage();
      const items: StorageItem[] = Object.keys(storage)
        .filter((key) => /^easy-notebook-(?!settings)/.test(key))
        .map((key) => {
          const value = storage.getItem(key) || '';
          let parsed: unknown;
          try {
            parsed = JSON.parse(value);
          } catch {
            parsed = null;
          }
          const metadata =
            parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : {};
          return {
            key,
            size: value.length,
            timestamp: finiteNumber(metadata.timestamp),
            importance: finiteNumber(metadata.importance),
          };
        });
      items.sort((a, b) => a.importance - b.importance || a.timestamp - b.timestamp);
      let freedSpace = 0;
      for (const item of items) {
        storage.removeItem(item.key);
        freedSpace += item.size;
        if (freedSpace >= 1024 * 1024) break;
      }
      return true;
    } catch (error) {
      this.dependencies.report('Storage cleanup failed', error);
      return false;
    }
  };
}
