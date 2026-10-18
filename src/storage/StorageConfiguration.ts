import { DEFAULT_STORAGE_CONFIG, type StorageConfigEntity } from './schema';

/** Validated configuration value. Missing records use defaults; invalid records fail explicitly. */
export class StorageConfiguration {
  private readonly record: StorageConfigEntity;

  constructor(record?: StorageConfigEntity) {
    this.record = { ...(record ?? DEFAULT_STORAGE_CONFIG) };
    const numericFields = [
      'maxNotebooks',
      'maxTotalSize',
      'maxFileSize',
      'cleanupInterval',
      'retentionPeriod',
      'lastCleanup',
    ] as const;
    for (const field of numericFields) {
      if (!Number.isSafeInteger(this.record[field]) || this.record[field] < 0) {
        throw new Error(
          `Invalid storage configuration: ${field} must be a nonnegative safe integer`
        );
      }
    }
    if (this.record.id !== 'config' || typeof this.record.compressionEnabled !== 'boolean') {
      throw new Error('Invalid storage configuration identity or compression flag');
    }
  }

  toRecord(): StorageConfigEntity {
    return { ...this.record };
  }
}
