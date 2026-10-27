import { describe, expect, it } from 'vitest';
import { NotebookRetentionPolicy } from './NotebookRetentionPolicy';
import { DEFAULT_STORAGE_CONFIG, type NotebookEntity } from './schema';

const emptyUsage = { totalBytes: 0, bytesByNotebook: new Map<string, number>() };

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
  retention: 'evictable',
});

describe('NotebookRetentionPolicy', () => {
  it('separates expired and capacity candidates and preserves input order', () => {
    const input = [book('expired', 10), book('new', 100), book('middle', 90)];
    const policy = new NotebookRetentionPolicy({
      ...DEFAULT_STORAGE_CONFIG,
      maxNotebooks: 1,
      retentionPeriod: 90,
    });
    const result = policy.select(input, 100, emptyUsage);
    expect(result.inactive.map((item) => item.id)).toEqual(['expired']);
    expect(result.excess.map((item) => item.id)).toEqual(['middle']);
    expect(input.map((item) => item.id)).toEqual(['expired', 'new', 'middle']);
  });

  it('uses a stable identity tie-break and supports zero capacity', () => {
    const input = [book('b', 100), book('a', 100)];
    const config = { ...DEFAULT_STORAGE_CONFIG, maxNotebooks: 1 };
    expect(
      new NotebookRetentionPolicy(config)
        .select(input, 100, emptyUsage)
        .excess.map((item) => item.id)
    ).toEqual(['b']);
    expect(
      new NotebookRetentionPolicy({ ...config, maxNotebooks: 0 }).select(input, 100, emptyUsage)
        .excess
    ).toHaveLength(2);
  });

  it.each(['regular', 'emergency'] as const)(
    'retains persistent and unclassified documents during %s cleanup',
    (mode) => {
      const config = { ...DEFAULT_STORAGE_CONFIG, maxNotebooks: 0, retentionPeriod: 0 };
      const result = new NotebookRetentionPolicy(config).select(
        [
          { ...book('document', 0), retention: 'persistent' },
          { ...book('unclassified', 0), retention: undefined },
          book('cache', 0),
        ],
        100,
        emptyUsage,
        mode
      );
      expect([...result.inactive, ...result.excess].map((item) => item.id)).toEqual(['cache']);
    }
  );

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

it('evicts oldest payload-bearing caches to meet the content budget', () => {
  const policy = new NotebookRetentionPolicy({ ...DEFAULT_STORAGE_CONFIG, maxTotalSize: 10 });
  const result = policy.select([book('old', 90), book('new', 100), book('remote', 80)], 100, {
    totalBytes: 16,
    bytesByNotebook: new Map([
      ['old', 8],
      ['new', 8],
    ]),
  });
  expect(result.excess.map((item) => item.id)).toEqual(['old']);
  expect(result).toMatchObject({
    contentBytesFreed: 8,
    remainingContentBytes: 8,
    overBudgetBytes: 0,
  });
});

it('reports persistent and orphan pressure that cache eviction cannot reclaim', () => {
  const policy = new NotebookRetentionPolicy({ ...DEFAULT_STORAGE_CONFIG, maxTotalSize: 5 });
  const result = policy.select(
    [{ ...book('document', 0), retention: 'persistent' }, book('cache', 100)],
    100,
    {
      totalBytes: 25,
      bytesByNotebook: new Map([
        ['document', 20],
        ['cache', 3],
      ]),
    }
  );
  expect(result.excess.map((item) => item.id)).toEqual(['cache']);
  expect(result).toMatchObject({
    contentBytesFreed: 3,
    remainingContentBytes: 22,
    overBudgetBytes: 17,
  });
});

it('uses the emergency content target and accounts expired payload only once', () => {
  const policy = new NotebookRetentionPolicy({
    ...DEFAULT_STORAGE_CONFIG,
    maxTotalSize: 10,
    retentionPeriod: 50,
  });
  const usage = {
    totalBytes: 10,
    bytesByNotebook: new Map([
      ['old', 3],
      ['new', 7],
    ]),
  };
  const input = [book('old', 0), book('new', 100)];
  const regular = policy.select(input, 100, usage);
  const emergency = policy.select(input, 100, usage, 'emergency');
  expect(regular.contentBytesFreed).toBe(3);
  expect(regular.excess).toEqual([]);
  expect(emergency.excess.map((item) => item.id)).toEqual(['old']);
  expect(emergency.overBudgetBytes).toBe(0);
});

it.each([-1, NaN, Infinity, 1.5])('rejects invalid byte budget %s', (maxTotalSize) => {
  expect(() => new NotebookRetentionPolicy({ ...DEFAULT_STORAGE_CONFIG, maxTotalSize })).toThrow(
    'Invalid'
  );
});
