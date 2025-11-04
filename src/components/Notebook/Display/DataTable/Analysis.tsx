import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, PieChart, TrendingUp, MoreHorizontal } from 'lucide-react';
import usePreviewStore from '@Store/previewStore';
import useStore from '@Store/notebookStore';

// =====================================================
// Utilities & Types
// =====================================================

const getExcelColumnName = (index: number): string => {
  let result = '';
  while (index >= 0) {
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26) - 1;
  }
  return result;
};

export interface CSVRow {
  [key: string]: string | number | boolean | null | undefined;
}

interface ColumnStats {
  type: 'string' | 'number' | 'date' | 'mixed';
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
}

interface CSVAnalytics {
  totalRows: number;
  totalColumns: number;
  memoryUsage: string;
  columnStats: Record<string, ColumnStats>;
  dataQuality: { completeness: number; consistency: number; validity: number };
}

// Rough UTF-8 size estimator
const approxSizeKB = (obj: unknown) => {
  try {
    const str = JSON.stringify(obj) ?? '';
    const bytes = new TextEncoder().encode(str).length;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  } catch {
    return '—';
  }
};

// Read column widths from worksheet !cols, fallback to heuristic
const pickColumnWidth = (wpx?: number, headerLen?: number) => {
  if (wpx && Number.isFinite(wpx)) return Math.max(80, Math.min(380, Math.round(wpx)));
  return Math.max(120, Math.min(300, (headerLen ?? 10) * 10));
};

// =====================================================
// Analyzer
// =====================================================
class CSVAnalyzer {
  static analyzeData(data: CSVRow[]): CSVAnalytics {
    if (!data?.length) {
      return { totalRows: 0, totalColumns: 0, memoryUsage: '0 KB', columnStats: {}, dataQuality: { completeness: 0, consistency: 0, validity: 0 } };
    }

    const columns = Array.from(
      data.reduce<Set<string>>((set, row) => {
        Object.keys(row ?? {}).forEach((k) => set.add(k));
        return set;
      }, new Set())
    );

    const columnStats: Record<string, ColumnStats> = {};

    columns.forEach((column) => {
      const rawValues = data.map((r) => r?.[column]).filter((v) => v !== undefined);
      const values = rawValues.filter((v) => v !== null && v !== '');
      const uniqueValues = new Set(values.map((v) => String(v)));

      const numericValues = values
        .map((v) => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))))
        .filter((n) => Number.isFinite(n)) as number[];

      const dateValues = values
        .map((v) => (typeof v === 'string' || typeof v === 'number' ? new Date(v) : null))
        .filter((d): d is Date => !!d && !isNaN(d.getTime()));

      const isMostlyNumeric = numericValues.length >= values.length * 0.8 && numericValues.length > 0;
      const isMostlyDate = !isMostlyNumeric && dateValues.length >= values.length * 0.8 && dateValues.length > 0;

      const base: ColumnStats = {
        type: isMostlyNumeric ? 'number' : isMostlyDate ? 'date' : values.length ? 'string' : 'mixed',
        nullCount: data.length - values.length,
        uniqueCount: uniqueValues.size,
      };

      if (isMostlyNumeric) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        columnStats[column] = { ...base, min: Math.min(...numericValues), max: Math.max(...numericValues), mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length, median };
      } else if (isMostlyDate) {
        const times = dateValues.map((d) => d.getTime());
        columnStats[column] = { ...base, min: new Date(Math.min(...times)).toISOString(), max: new Date(Math.max(...times)).toISOString() };
      } else {
        columnStats[column] = base;
      }
    });

    const totalCells = data.length * columns.length;
    const nullCells = Object.values(columnStats).reduce((sum, s) => sum + s.nullCount, 0);
    const completeness = totalCells ? ((totalCells - nullCells) / totalCells) * 100 : 0;

    return { totalRows: data.length, totalColumns: columns.length, memoryUsage: approxSizeKB(data), columnStats, dataQuality: { completeness: Math.round(completeness * 100) / 100, consistency: Math.max(0, Math.min(100, 100 - (nullCells / Math.max(1, totalCells)) * 120)), validity: 90 } };
  }
}


// =====================================================
// Main Component
// =====================================================
interface TableBlock { headers: string[]; headersDisplay: string[]; rows: CSVRow[]; colWidths: number[]; }

interface AdvancedCSVPreviewProps {
  typeOverride?: 'csv' | 'xlsx';
}

const ensureUniqueHeaders = (headers: string[]) => {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = h || getExcelColumnName(i);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${getExcelColumnName(i)}`; // e.g., "Header_B"
  });
};

const isEmptyRow = (row: any[]) => row.every((v) => v === '' || v === undefined || v === null);

// choose header row inside a segment: prefer row with most non-empty & not all-identical values
const findHeaderIndex = (segment: any[][]): number => {
  let bestIdx = 0;
  let bestScore = -1;
  segment.forEach((row, idx) => {
    const filled = row.filter((v: any) => v !== '' && v !== null && v !== undefined);
    const distinct = new Set(filled.map((x: any) => String(x))).size;
    const allSame = distinct <= 1;
    const score = filled.length + (allSame ? -filled.length : 0);
    if (filled.length >= 2 && score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  return bestIdx;
};

const Analysis: React.FC<AdvancedCSVPreviewProps> = ({ typeOverride }) => {
  const { activeFile, activeSplitFile } = usePreviewStore();
  const { detachedCellId } = useStore();
  
  // Check if we're in split view mode (detached cell)
  const isInSplitView = !!detachedCellId;
  const currentFile = isInSplitView ? activeSplitFile : activeFile;
  // Multi-table blocks parsed from sheet
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [blockIdx, setBlockIdx] = useState(0);

  // =============================
  // Parsing with merged-cells & multi-table (vertical) handling
  // =============================
  const parsed = useMemo(() => {
    const fileType = typeOverride || currentFile?.type;
    const content = currentFile?.content ?? '';
    const empty = { blocks: [] as TableBlock[] };
    if (!content || (fileType !== 'csv' && fileType !== 'xlsx')) return empty;

    try {
      let outBlocks: TableBlock[] = [];

      if (fileType === 'xlsx') {
        const bstr = atob(content);
        const bytes = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
        const wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

        // Apply merges
        const merges: XLSX.Range[] = (ws['!merges'] || []) as XLSX.Range[];
        merges.forEach((rng) => {
          const top = grid[rng.s.r]?.[rng.s.c] ?? '';
          for (let r = rng.s.r; r <= rng.e.r; r++) {
            for (let c = rng.s.c; c <= rng.e.c; c++) grid[r][c] = top;
          }
        });

        // Split vertically by empty rows => multiple table blocks
        const segments: any[][][] = [];
        let cur: any[][] = [];
        for (const row of grid) {
          if (isEmptyRow(row)) {
            if (cur.length) { segments.push(cur); cur = []; }
          } else {
            cur.push(row);
          }
        }
        if (cur.length) segments.push(cur);

        // Column widths from sheet (best-effort)
        const colsMeta = (ws['!cols'] || []) as Array<{ wpx?: number }>;

        for (const seg of segments) {
          if (!seg.length) continue;
          const hIdx = findHeaderIndex(seg);
          const headerRow = seg[hIdx];
          const headersRaw = headerRow.map((h: any, i: number) => {
            const name = String(h ?? '').trim();
            return name === '' || name === 'undefined' || name === 'null' ? getExcelColumnName(i) : name;
          });
          const headers = ensureUniqueHeaders(headersRaw);

          const colW = headers.map((h, i) => pickColumnWidth(colsMeta[i]?.wpx, String(headersRaw[i] ?? '').length));

          const dataRows = seg.slice(hIdx + 1); // start after the header row we picked
          const rows = dataRows.map((row) => {
            const obj: CSVRow = {};
            headers.forEach((h, i) => (obj[h] = row[i]));
            return obj;
          });

          outBlocks.push({ headers, headersDisplay: headersRaw, rows, colWidths: colW });
        }
      } else {
        // CSV / JSON
        let rows: CSVRow[] = [];
        let headersRaw: string[] = [];
        const looksJson = content.trim().startsWith('[') || content.trim().startsWith('{');
        if (looksJson) {
          rows = JSON.parse(content) as CSVRow[];
          headersRaw = Array.from(rows.reduce<Set<string>>((s, r) => { Object.keys(r ?? {}).forEach((k) => s.add(k)); return s; }, new Set()));
        } else {
          const wb = XLSX.read(content, { type: 'string' });
          const sheet = wb.SheetNames[0];
          const ws = wb.Sheets[sheet];
          const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
          const nonEmpty = grid.filter((r) => !isEmptyRow(r));
          const hIdx = findHeaderIndex(nonEmpty.length ? nonEmpty : grid);
          const headerRow = (nonEmpty.length ? nonEmpty : grid)[hIdx] || grid[0] || [];
          headersRaw = (headerRow || []).map((h: any, i: number) => {
            const name = String(h ?? '').trim();
            return name === '' || name === 'undefined' || name === 'null' ? getExcelColumnName(i) : name;
          });
          const headers = ensureUniqueHeaders(headersRaw);
          rows = grid.slice(grid.indexOf(headerRow) + 1).map((row) => {
            const obj: CSVRow = {};
            headers.forEach((h, i) => (obj[h] = row[i]));
            return obj;
          });
          outBlocks.push({ headers, headersDisplay: headersRaw, rows, colWidths: headers.map((h) => pickColumnWidth(undefined, h.length)) });
          return { blocks: outBlocks };
        }
        const headers = ensureUniqueHeaders(headersRaw);
        outBlocks.push({ headers, headersDisplay: headersRaw, rows, colWidths: headers.map((h) => pickColumnWidth(undefined, h.length)) });
      }

      return { blocks: outBlocks };
    } catch (e) {
      console.error('Failed to parse input file:', e);
      return empty;
    }
  }, [currentFile, typeOverride]);

  // Bind parsed blocks to state (avoid setState in useMemo during render)
  useEffect(() => {
    setBlocks(parsed.blocks);
    setBlockIdx(0);
  }, [parsed.blocks]);

  const activeBlock = blocks[blockIdx] || { headers: [], headersDisplay: [], rows: [], colWidths: [] };


  // Analytics view (computed on current active block)
  const renderAnalytics = () => {
    const analytics = CSVAnalyzer.analyzeData(activeBlock.rows);
    return (
      <div className="p-6 bg-white rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-theme-50 p-4 rounded-lg"><div className="flex items-center gap-2 mb-2"><BarChart3 className="w-5 h-5 text-theme-600" /><h3 className="font-semibold text-theme-900">Total Rows</h3></div><p className="text-2xl font-bold text-theme-700">{analytics.totalRows.toLocaleString()}</p></div>
          <div className="bg-green-50 p-4 rounded-lg"><div className="flex items-center gap-2 mb-2"><PieChart className="w-5 h-5 text-green-600" /><h3 className="font-semibold text-green-900">Columns</h3></div><p className="text-2xl font-bold text-green-700">{analytics.totalColumns}</p></div>
          <div className="bg-purple-50 p-4 rounded-lg"><div className="flex items-center gap-2 mb-2"><TrendingUp className="w-5 h-5 text-purple-600" /><h3 className="font-semibold text-purple-900">Completeness</h3></div><p className="text-2xl font-bold text-purple-700">{analytics.dataQuality.completeness}%</p></div>
          <div className="bg-orange-50 p-4 rounded-lg"><div className="flex items-center gap-2 mb-2"><MoreHorizontal className="w-5 h-5 text-orange-600" /><h3 className="font-semibold text-orange-900">Memory Usage</h3></div><p className="text-2xl font-bold text-orange-700">{analytics.memoryUsage}</p></div>
        </div>
        <div className="overflow-auto flex-grow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>{['Column','Type','Completeness','Unique Values','Min','Max','Mean','Median'].map((h) => (<th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(analytics.columnStats).map(([column, stats]) => (
                <tr key={column} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-theme-700">{column}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stats.type==='number'?'bg-theme-100 text-theme-800':stats.type==='date'?'bg-indigo-100 text-indigo-800':'bg-amber-100 text-amber-800'}`}>{stats.type==='number'?'Numeric':stats.type==='date'?'Date':'Categorical'}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{analytics.totalRows>0?(((analytics.totalRows-stats.nullCount)/analytics.totalRows)*100).toFixed(1):0}%</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{stats.uniqueCount}{analytics.totalRows>0 && (<span className="ml-1 text-gray-500 text-xs">({((stats.uniqueCount/Math.max(1,analytics.totalRows-stats.nullCount))*100).toFixed(1)}%)</span>)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{stats.min!==undefined?(typeof stats.min==='number'?stats.min.toLocaleString(undefined,{maximumFractionDigits:2}):String(stats.min)):'-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{stats.max!==undefined?(typeof stats.max==='number'?stats.max.toLocaleString(undefined,{maximumFractionDigits:2}):String(stats.max)):'-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{stats.mean!==undefined?stats.mean.toLocaleString(undefined,{maximumFractionDigits:2}):'-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{stats.median!==undefined?stats.median.toLocaleString(undefined,{maximumFractionDigits:2}):'-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const fileType = typeOverride || currentFile?.type;
  if (!currentFile || (fileType !== 'csv' && fileType !== 'xlsx')) {
    return (
      <div className="flex items-center justify-center h-full"><div className="text-center text-gray-400"><div className="text-lg mb-2">No CSV/Excel file selected</div><div className="text-sm">Select a CSV or Excel file to preview</div></div></div>
    );
  }


  return (
    <div className="h-full flex flex-col bg-white">
      <div className="bg-white rounded-lg shadow-sm overflow-hidden flex-shrink-0">
        <div className="px-4 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <table className="w-auto"><tbody><tr>
                <td className="pr-6 align-middle"><span className="inline-flex items-center rounded-md bg-theme-600 px-2 py-1 text-xs font-medium text-white">Filename</span></td>
                <td className="pr-6 text-sm font-medium align-middle">{currentFile.name}</td>
                {activeBlock && (<>
                  <td className="pr-6 align-middle"><span className="inline-flex items-center rounded-md bg-theme-600 px-2 py-1 text-xs font-medium text-white">Rows</span></td>
                  <td className="pr-6 text-sm font-medium align-middle">{(activeBlock.rows?.length ?? 0).toLocaleString()}</td>
                  <td className="pr-6 align-middle"><span className="inline-flex items-center rounded-md bg-theme-600 px-2 py-1 text-xs font-medium text-white">Columns</span></td>
                  <td className="pr-6 text-sm font-medium align-middle">{activeBlock.headers.length}</td>
                </>)}
              </tr></tbody></table>

              {/* Block selector when multiple tables detected */}
              {blocks.length > 1 && (
                <div className="ml-4 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Table</span>
                  <select className="px-2 py-1 border border-gray-300 rounded text-sm" value={blockIdx} onChange={(e) => setBlockIdx(Number(e.target.value))}>
                    {blocks.map((b, i) => (
                      <option key={i} value={i}>{`Table ${i + 1} — ${b.headers.length} cols, ${b.rows.length} rows`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="mt-4 flex-grow flex flex-col overflow-hidden">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
          {renderAnalytics()}
        </div>
      </div>
    </div>
  );
};

export default Analysis;
