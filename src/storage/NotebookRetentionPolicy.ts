import type { NotebookEntity, StorageConfigEntity } from './schema';

export type CleanupMode = 'regular' | 'emergency';
export interface CleanupStats {
  notebooksDeleted: number;
  filesDeleted: number;
  bytesFreed: number;
  duration: number;
}
export interface CleanupCandidates {
  inactive: NotebookEntity[];
  excess: NotebookEntity[];
  totalBytesToFree: number;
}

/** Selects disjoint candidates, retaining the most recently accessed notebooks. */
export class NotebookRetentionPolicy {
  constructor(private readonly config: StorageConfigEntity) {
    if (
      !Number.isSafeInteger(config.maxNotebooks) ||
      config.maxNotebooks < 0 ||
      !Number.isFinite(config.retentionPeriod) ||
      config.retentionPeriod < 0
    ) {
      throw new Error('Invalid notebook retention configuration');
    }
  }

  select(notebooks: NotebookEntity[], now: number, mode: CleanupMode = 'regular') {
    const ordered = notebooks
      .filter((book) => book.retention === 'evictable')
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt || a.id.localeCompare(b.id));
    const inactive =
      mode === 'regular'
        ? ordered.filter((book) => book.lastAccessedAt <= now - this.config.retentionPeriod)
        : [];
    const inactiveIds = new Set(inactive.map((book) => book.id));
    const remaining = ordered.filter((book) => !inactiveIds.has(book.id));
    const capacity =
      mode === 'emergency' ? Math.floor(this.config.maxNotebooks * 0.7) : this.config.maxNotebooks;
    return { inactive, excess: remaining.slice(capacity) };
  }
}
