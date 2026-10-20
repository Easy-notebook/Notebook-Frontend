import { afterEach, expect, it, vi } from 'vitest';
import { analyzeDatasetStructure } from './dataAnalysis';
import { DatasetAnalysisSession } from '../store/DatasetAnalysisSession';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('produces typed numeric, categorical, date, and missing-value statistics', async () => {
  const result = await analyzeDatasetStructure(
    'amount,group,date\n1,A,2026-01-01\n3,B,2026-01-02\n,A,'
  );
  expect(result).toMatchObject({
    columns: ['amount', 'group', 'date'],
    metadata: {
      rowCount: 3,
      columnCount: 3,
      numericColumns: ['amount'],
      categoricalColumns: ['group'],
      dateColumns: ['date'],
      missingValueSummary: { amount: 1, group: 0, date: 1 },
      uniqueValueCounts: { amount: 2, group: 2, date: 2 },
      stats: {
        amount: {
          dataType: 'numeric',
          count: 2,
          empty: 1,
          unique: 2,
          topValues: [1, 3],
          min: 1,
          max: 3,
          sum: 4,
          avg: 2,
          median: 2,
        },
      },
    },
  });
});

it('accepts a file and parser options while preserving odd-length median', async () => {
  const file = new File(['amount;group\n9;A\n1;B\n5;A'], 'dataset.csv');
  const result = await analyzeDatasetStructure(file, { delimiter: ';' });
  expect(result?.metadata.stats.amount).toMatchObject({
    dataType: 'numeric',
    min: 1,
    max: 9,
    median: 5,
    avg: 5,
  });
});

it('returns null for empty content', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await analyzeDatasetStructure('')).toBeNull();
});

it('settles aborted file reads as a failed analysis', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'FileReader',
    class {
      onabort?: () => void;
      readAsText() {
        queueMicrotask(() => this.onabort?.());
      }
    }
  );
  expect(await analyzeDatasetStructure(new File(['a'], 'dataset.csv'))).toBeNull();
});

it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', '__parsed_extra'])(
  'rejects the parser-reserved column %s instead of publishing incorrect statistics',
  async (column) => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await analyzeDatasetStructure(`${column},value\n1,2\n3,4`)).toBeNull();
    expect(report).toHaveBeenCalledWith('Error analyzing dataset structure:', expect.any(Error));
  }
);

it('validates transformed headers before publishing statistics', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(
    await analyzeDatasetStructure('name,value\n1,2', {
      transformHeader: (header) => (header === 'name' ? '__proto__' : header),
    })
  ).toBeNull();
});

it('accepts ordinary columns that merely contain reserved words', async () => {
  const result = await analyzeDatasetStructure('constructor_count,prototype\n1,2\n3,4');
  expect(result?.metadata.numericColumns).toEqual(['constructor_count', 'prototype']);
});

it('settles the analysis session without exposing columns or context from unsupported input', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const publish = vi.fn();
  const reportError = vi.fn();
  const session = new DatasetAnalysisSession(analyzeDatasetStructure, publish, reportError);
  const file = new File(['__proto__,value\n1,2'], 'dataset.csv');
  await session.select(file);
  expect(publish).toHaveBeenLastCalledWith({
    currentFile: file,
    isUploading: false,
    file_columns: [],
    datasetInfo: '',
  });
  expect(reportError).toHaveBeenCalledOnce();
});
