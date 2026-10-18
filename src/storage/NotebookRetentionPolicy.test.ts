import { describe, expect, it } from 'vitest';
import { NotebookRetentionPolicy } from './NotebookRetentionPolicy';
import { DEFAULT_STORAGE_CONFIG, type NotebookEntity } from './schema';

const book = (id: string, lastAccessedAt: number): NotebookEntity => ({
  id,
  lastAccessedAt,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  accessCount: 1,
  fileCount: 0,
  totalSize: 0,
  cacheEnabled: true,
});

describe('NotebookRetentionPolicy', () => {
  it('separates expired and capacity candidates and preserves input order', () => {
    const input = [book('expired', 10), book('new', 100), book('middle', 90)];
    const policy = new NotebookRetentionPolicy({
      ...DEFAULT_STORAGE_CONFIG,
      maxNotebooks: 1,
      retentionPeriod: 90,
    });
    const result = policy.select(input, 100);
    expect(result.inactive.map((item) => item.id)).toEqual(['expired']);
    expect(result.excess.map((item) => item.id)).toEqual(['middle']);
    expect(input.map((item) => item.id)).toEqual(['expired', 'new', 'middle']);
  });

  it('uses a stable identity tie-break and supports zero capacity', () => {
    const input = [book('b', 100), book('a', 100)];
    const config = { ...DEFAULT_STORAGE_CONFIG, maxNotebooks: 1 };
    expect(
      new NotebookRetentionPolicy(config).select(input, 100).excess.map((item) => item.id)
    ).toEqual(['b']);
    expect(
      new NotebookRetentionPolicy({ ...config, maxNotebooks: 0 }).select(input, 100).excess
    ).toHaveLength(2);
  });

  it.each([-1, NaN, Infinity, 1.5])(
    'rejects invalid capacity %s before selecting deletions',
    (maxNotebooks) => {
      expect(
        () => new NotebookRetentionPolicy({ ...DEFAULT_STORAGE_CONFIG, maxNotebooks })
      ).toThrow('Invalid');
    }
  );

  it.each([-1, NaN, Infinity])(
    'rejects invalid retention %s before selecting deletions',
    (retentionPeriod) => {
      expect(
        () => new NotebookRetentionPolicy({ ...DEFAULT_STORAGE_CONFIG, retentionPeriod })
      ).toThrow('Invalid');
    }
  );
});
