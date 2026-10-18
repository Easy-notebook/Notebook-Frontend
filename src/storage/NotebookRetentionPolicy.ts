import { StorageConfiguration } from './StorageConfiguration';
import type { ContentUsage } from './StorageUsage';
import type { NotebookEntity, StorageConfigEntity } from './schema';

export type CleanupMode = 'regular' | 'emergency';
export interface ContentBudgetResult {
  contentBytesFreed: number;
  remainingContentBytes: number;
  overBudgetBytes: number;
}
export interface CleanupStats extends ContentBudgetResult {
  notebooksDeleted: number;
  filesDeleted: number;
  bytesFreed: number;
  duration: number;
}
export interface CleanupCandidates extends ContentBudgetResult {
  inactive: NotebookEntity[];
  excess: NotebookEntity[];
  totalBytesToFree: number;
}

/** Selects disjoint candidates, retaining the most recently accessed notebooks. */
export class NotebookRetentionPolicy {
  constructor(private readonly config: StorageConfigEntity) {
    new StorageConfiguration(config);
  }

  select(
    notebooks: NotebookEntity[],
    now: number,
    usage: ContentUsage,
    mode: CleanupMode = 'regular'
  ) {
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
    const excess = remaining.slice(capacity);
    const bytes = (book: NotebookEntity) => usage.bytesByNotebook.get(book.id) ?? 0;
    let remainingContentBytes =
      usage.totalBytes - [...inactive, ...excess].reduce((sum, book) => sum + bytes(book), 0);
    const byteLimit =
      mode === 'emergency' ? Math.floor(this.config.maxTotalSize * 0.7) : this.config.maxTotalSize;
    // Remove the oldest remaining caches until the content budget is met. Zero-byte
    // caches cannot relieve byte pressure and remain governed by count/age only.
    for (const book of remaining.slice(0, capacity).reverse()) {
      if (remainingContentBytes <= byteLimit) break;
      if (bytes(book) === 0) continue;
      excess.push(book);
      remainingContentBytes -= bytes(book);
    }
    return {
      inactive,
      excess,
      remainingContentBytes,
      contentBytesFreed: usage.totalBytes - remainingContentBytes,
      overBudgetBytes: Math.max(0, remainingContentBytes - byteLimit),
    };
  }
}
