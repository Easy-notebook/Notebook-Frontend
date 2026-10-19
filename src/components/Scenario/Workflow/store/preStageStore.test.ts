import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const analyze = vi.hoisted(() => vi.fn());
vi.mock('../utils/dataAnalysis', () => ({ analyzeDatasetStructure: analyze }));
import usePreStageStore from './preStageStore';
import type { AnalysisResult } from '@Store/models';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function result(column: string): AnalysisResult {
  return {
    columns: [column],
    metadata: {
      rowCount: 2,
      columnCount: 1,
      numericColumns: [column],
      categoricalColumns: [],
      dateColumns: [],
      missingValueSummary: {},
      uniqueValueCounts: {},
      stats: {},
    },
  };
}
const store = () => usePreStageStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  store().resetStore();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  store().resetStore();
  vi.restoreAllMocks();
});
it('accepts a new file during analysis and ignores the previous result', async () => {
  const old = deferred<AnalysisResult>();
  const recent = deferred<AnalysisResult>();
  analyze.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise);
  const a = new File(['a'], 'a.csv');
  const b = new File(['b'], 'b.csv');
  const first = store().setCurrentFile(a);
  const second = store().setCurrentFile(b);
  expect(analyze).toHaveBeenCalledTimes(2);
  old.resolve(result('old'));
  await first;
  expect(store()).toMatchObject({
    currentFile: b,
    isUploading: true,
    file_columns: [],
    datasetInfo: '',
  });
  recent.resolve(result('new'));
  await second;
  expect(store()).toMatchObject({ currentFile: b, isUploading: false, file_columns: ['new'] });
  expect(store().datasetInfo).toContain('Numeric columns (1): new.');
});
it('keeps the latest result when the older analysis completes last', async () => {
  const old = deferred<AnalysisResult>();
  analyze.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result('new'));
  const first = store().setCurrentFile(new File([], 'a.csv'));
  await store().setCurrentFile(new File([], 'b.csv'));
  old.resolve(result('old'));
  await first;
  expect(store().file_columns).toEqual(['new']);
});
it.each(['clear', 'reset'] as const)(
  '%s invalidates pending publication and clears dataset information',
  async (action) => {
    const pending = deferred<AnalysisResult>();
    analyze.mockReturnValue(pending.promise);
    store().setFileColumns(['previous']);
    store().setDatasetInfo('previous');
    const operation = store().setCurrentFile(new File([], 'a.csv'));
    expect(store().file_columns).toEqual([]);
    expect(store().datasetInfo).toBe('');
    if (action === 'clear') await store().setCurrentFile(null);
    else store().resetStore();
    pending.resolve(result('stale'));
    await operation;
    expect(store()).toMatchObject({
      currentFile: null,
      isUploading: false,
      file_columns: [],
      datasetInfo: '',
    });
  }
);
it('ignores obsolete failure without clearing the current loading state', async () => {
  const old = deferred<AnalysisResult>();
  const recent = deferred<AnalysisResult>();
  analyze.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise);
  const first = store().setCurrentFile(new File([], 'a.csv'));
  const second = store().setCurrentFile(new File([], 'b.csv'));
  old.reject(new Error('old failure'));
  await first;
  expect(store().isUploading).toBe(true);
  expect(console.error).not.toHaveBeenCalled();
  recent.resolve(result('new'));
  await second;
});
it('settles current failure without retaining columns from an earlier dataset and supports retry', async () => {
  analyze
    .mockResolvedValueOnce(result('old'))
    .mockRejectedValueOnce(new Error('unreadable'))
    .mockResolvedValueOnce(result('retry'));
  const file = new File([], 'a.csv');
  await store().setCurrentFile(file);
  await store().setCurrentFile(file);
  expect(store()).toMatchObject({
    currentFile: file,
    isUploading: false,
    file_columns: [],
    datasetInfo: '',
  });
  expect(console.error).toHaveBeenCalledOnce();
  await store().setCurrentFile(file);
  expect(store().file_columns).toEqual(['retry']);
});
it('uses request identity even when the same File is selected again', async () => {
  const old = deferred<AnalysisResult>();
  analyze.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result('latest'));
  const file = new File([], 'a.csv');
  const first = store().setCurrentFile(file);
  await store().setCurrentFile(file);
  old.resolve(result('old'));
  await first;
  expect(store().file_columns).toEqual(['latest']);
});
it('does not start analysis when a synchronous subscriber resets the selection', async () => {
  const unsubscribe = usePreStageStore.subscribe((state) => {
    if (state.isUploading) state.resetStore();
  });
  try {
    await store().setCurrentFile(new File([], 'a.csv'));
  } finally {
    unsubscribe();
  }
  expect(analyze).not.toHaveBeenCalled();
  expect(store().currentFile).toBeNull();
});
it('does not use the externally writable loading flag as a request lock', async () => {
  store().setIsUploading(true);
  analyze.mockResolvedValue(result('selected'));
  await store().setCurrentFile(new File([], 'a.csv'));
  expect(store().file_columns).toEqual(['selected']);
  expect(store().isUploading).toBe(false);
});
