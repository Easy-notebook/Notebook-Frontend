import { describe, expect, it } from 'vitest';
import { StorageConfiguration } from './StorageConfiguration';
import { DEFAULT_STORAGE_CONFIG } from './schema';

describe('StorageConfiguration', () => {
  it('returns detached default values', () => {
    const value = new StorageConfiguration();
    const first = value.toRecord();
    first.maxFileSize = 0;
    expect(value.toRecord()).toEqual(DEFAULT_STORAGE_CONFIG);
  });

  it.each([
    'maxNotebooks',
    'maxTotalSize',
    'maxFileSize',
    'cleanupInterval',
    'retentionPeriod',
    'lastCleanup',
  ] as const)('rejects invalid %s and accepts zero', (field) => {
    for (const invalid of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        () => new StorageConfiguration({ ...DEFAULT_STORAGE_CONFIG, [field]: invalid })
      ).toThrow(field);
    }
    expect(
      new StorageConfiguration({ ...DEFAULT_STORAGE_CONFIG, [field]: 0 }).toRecord()[field]
    ).toBe(0);
  });
});
