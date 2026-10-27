import type { FileSaveData, NotebookSaveData } from '../services/persistence/interfaces';

interface NotebookImportBatch {
  notebook: NotebookSaveData;
  files: FileSaveData[];
}

/** Validates detached historical records before any destination operation is admitted. */
export class LegacyMigrationPlan {
  readonly batches: NotebookImportBatch[] = [];
  readonly errors: string[] = [];
  readonly notebooksFound: number;
  readonly filesFound: number;

  constructor(records: unknown[], now = Date.now()) {
    this.filesFound = records.length;
    const groups = new Map<string, Record<string, unknown>[]>();
    records.forEach((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        this.errors.push(`Invalid historical record at index ${index}: expected an object`);
        return;
      }
      const source = record as Record<string, unknown>;
      if (typeof source.notebookId !== 'string' || !source.notebookId.trim()) {
        this.errors.push(`Invalid historical record at index ${index}: missing notebook identity`);
        return;
      }
      const group = groups.get(source.notebookId) ?? [];
      group.push(source);
      groups.set(source.notebookId, group);
    });
    this.notebooksFound = groups.size;
    for (const [id, sources] of groups) {
      try {
        let lastAccessedAt = 0;
        let accessCount = 0;
        const files = sources.map((source): FileSaveData => {
          const filePath = this.requiredText(source.path, 'path');
          const fileName = this.requiredText(source.name, 'name');
          if (typeof source.content !== 'string') {
            throw new Error(`Invalid content for ${filePath}: expected a string`);
          }
          const cachedAt = this.optionalInteger(source.cachedAt, 'cachedAt', now);
          const lastAccessed = this.optionalInteger(source.lastAccessed, 'lastAccessed', cachedAt);
          lastAccessedAt = Math.max(lastAccessedAt, lastAccessed);
          accessCount = Math.max(
            accessCount,
            this.optionalInteger(source.accessCount, 'accessCount', 0)
          );
          const lastModified =
            source.lastModified === undefined
              ? new Date(now).toISOString()
              : this.requiredText(source.lastModified, 'lastModified');
          return {
            notebookId: id,
            filePath,
            fileName,
            content: source.content,
            size: this.optionalInteger(
              source.size,
              'size',
              new TextEncoder().encode(source.content).byteLength
            ),
            lastModified,
          };
        });
        this.batches.push({
          notebook: {
            id,
            name: `Notebook ${id.slice(0, 8)}`,
            description: `Migrated notebook with ${files.length} files`,
            lastAccessedAt,
            accessCount,
            cacheEnabled: true,
          },
          files,
        });
      } catch (error) {
        this.errors.push(`Invalid historical notebook ${id}: ${error}`);
      }
    }
  }

  private requiredText(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`Invalid ${field}: expected nonempty text`);
    return value;
  }

  private optionalInteger(value: unknown, field: string, absent: number): number {
    if (value === undefined) return absent;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid ${field}: expected a nonnegative safe integer`);
    }
    return value;
  }
}
