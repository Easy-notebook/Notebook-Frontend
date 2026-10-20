import Papa, { type ParseConfig } from 'papaparse';
import _ from 'lodash-es';
import type { AnalysisResult, ColumnStatistics } from '@Store/models/preStage';

/* ---------- helpers ---------- */
const readContent = (fileOrText: string | Blob): Promise<string> =>
  typeof fileOrText === 'string'
    ? Promise.resolve(fileOrText)
    : new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => {
          if (typeof r.result === 'string') res(r.result);
          else rej(new Error('Expected text from dataset reader'));
        };
        r.onerror = () => rej(r.error ?? new Error('Failed to read dataset'));
        r.onabort = () => rej(new DOMException('Dataset read aborted', 'AbortError'));
        r.readAsText(fileOrText);
      });

const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/* ---------- main ---------- */
export const analyzeDatasetStructure = async (
  fileOrText: string | Blob,
  options: ParseConfig<Record<string, unknown>> = {}
): Promise<AnalysisResult | null> => {
  try {
    const content = await readContent(fileOrText);
    if (!content) throw new Error('Empty file content');

    const parsed = Papa.parse<Record<string, unknown>>(content, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', ';', '\t', '|'],
      ...options,
    });

    const data = parsed.data ?? [];
    const columns = parsed.meta?.fields ?? [];
    if (!columns.length) throw new Error('No header detected');

    const stats: Record<string, ColumnStatistics> = {};
    const numericColumns: string[] = [];
    const categoricalColumns: string[] = [];
    const dateColumns: string[] = [];
    const missingValueSummary: Record<string, number> = {};
    const uniqueValueCounts: Record<string, number> = {};

    columns.forEach((col) => {
      const colVals = data
        .map((r) => r[col])
        .filter((v) => v !== null && v !== undefined && v !== '');
      const numVals = colVals.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
      const uniqVals = _.uniq(colVals);

      const base = {
        count: colVals.length,
        empty: data.length - colVals.length,
        unique: uniqVals.length,
        topValues: uniqVals.slice(0, 5),
      };

      let stat: ColumnStatistics;
      if (numVals.length && numVals.length === colVals.length) {
        const sum = _.sum(numVals);
        stat = {
          ...base,
          dataType: 'numeric',
          min: numVals.reduce((min, value) => Math.min(min, value), numVals[0]),
          max: numVals.reduce((max, value) => Math.max(max, value), numVals[0]),
          sum,
          avg: sum / numVals.length,
          median: median(numVals),
        };
        numericColumns.push(col);
      } else if (
        colVals.length &&
        colVals.every((v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)))
      ) {
        stat = { ...base, dataType: 'date' };
        dateColumns.push(col);
      } else {
        stat = { ...base, dataType: 'categorical' };
        categoricalColumns.push(col);
      }

      stats[col] = stat;
      missingValueSummary[col] = stat.empty;
      uniqueValueCounts[col] = stat.unique;
    });

    const metadata = {
      rowCount: data.length,
      columnCount: columns.length,
      numericColumns,
      categoricalColumns,
      dateColumns,
      missingValueSummary,
      uniqueValueCounts,
      stats, // ← 统计信息已放入 metadata
    };

    return { columns, metadata };
  } catch (err) {
    console.error('Error analyzing dataset structure:', err);
    return null;
  }
};
