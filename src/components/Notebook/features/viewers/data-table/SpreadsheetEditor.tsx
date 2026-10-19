import { getExcelColumnName } from './SpreadsheetCoordinates';
import { SpreadsheetStructureChange } from './SpreadsheetStructureChange';
import type { CSVRow, ColumnInfo, CellFormat, SpreadsheetSnapshot } from './SpreadsheetSnapshot';
export type { CSVRow } from './SpreadsheetSnapshot';
// moved to features/viewers/data-table
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { parseTableCsv, serializeTableCsv } from './CsvCodec';
import { XlsxDocument } from './XlsxDocument';
import { SpreadsheetRowOrder } from './SpreadsheetRowOrder';
import type { SpreadsheetEditSession } from './SpreadsheetEditSession';
import { SpreadsheetHistory } from './SpreadsheetHistory';
import { VirtualSpreadsheetRow, type SpreadsheetRowRenderer } from './VirtualSpreadsheetRow';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  Download,
  ChevronDown,
  Copy,
  Clipboard,
  Trash2,
  Save,
  FileSpreadsheet,
  SortAsc,
  SortDesc,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  PaintBucket,
  Search,
  Replace,
  Plus,
  Minus,
  EyeOff,
  Eye,
  Lock,
  Unlock,
  X,
  ChevronRight,
} from 'lucide-react';
import usePreviewStore from '@Store/previewStore';
import type { FileObject } from '@Store/models';
// import { useTheme } from '@/contexts/ThemeContext'; // Unused

// =====================================================
// Types & Interfaces
// =====================================================
interface CellSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// Find & Replace state
interface FindReplaceState {
  isOpen: boolean;
  findText: string;
  replaceText: string;
  matchCase: boolean;
  matchWholeCell: boolean;
  currentMatchIndex: number;
  matches: Array<{ row: number; col: number }>;
}

// =====================================================
// Utilities
// =====================================================
const getCellAddress = (row: number, col: number): string => {
  return `${getExcelColumnName(col)}${row + 1}`;
};

const formatCellValue = (value: any, type: string): string => {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'number': {
      const num = Number(String(value).replace(/,/g, ''));
      return isNaN(num)
        ? String(value)
        : num.toLocaleString(undefined, { maximumFractionDigits: 10 });
    }
    case 'date': {
      const d = new Date(value);
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    case 'boolean':
      return String(value).toUpperCase();
    default:
      return String(value);
  }
};

const detectColumnType = (values: any[]): string => {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!nonEmpty.length) return 'string';
  const booleanValues = ['true', 'false', 'yes', 'no', '1', '0'];
  if (nonEmpty.every((v) => booleanValues.includes(String(v).toLowerCase()))) return 'boolean';
  const numbers = nonEmpty.filter((v) => {
    const s = String(v).replace(/,/g, '');
    return !isNaN(Number(s)) && s.trim() !== '';
  });
  if (numbers.length >= nonEmpty.length * 0.8) return 'number';
  const dates = nonEmpty.filter((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100;
  });
  if (dates.length >= nonEmpty.length * 0.8) return 'date';
  return 'string';
};

// =====================================================
// Main Component
// =====================================================
export interface SpreadsheetPreviewProps {
  typeOverride?: 'csv' | 'xlsx';
  showFormulaBar?: boolean;
}

export interface SpreadsheetEditorProps extends SpreadsheetPreviewProps {
  currentFile: FileObject | null;
  isInSplitView: boolean;
  editSession: SpreadsheetEditSession;
}

/** A mounted editor owns one file in one preview surface; all local state shares that lifetime. */
const SpreadsheetEditor: React.FC<SpreadsheetEditorProps> = ({
  typeOverride,
  showFormulaBar = true,
  currentFile,
  isInSplitView,
  editSession,
}) => {
  const setTabDirty = usePreviewStore((state) => state.setTabDirty);

  const [draftHistory] = useState(
    () =>
      new SpreadsheetHistory<SpreadsheetSnapshot>({ data: [], columns: [], cellFormats: {} }, () =>
        editSession.changed()
      )
  );
  const {
    value: { data, columns, cellFormats },
    canUndo,
    canRedo,
  } = useSyncExternalStore(draftHistory.subscribe, draftHistory.getSnapshot);
  const commitDraft = useCallback(
    (patch: Partial<SpreadsheetSnapshot>) => {
      draftHistory.commit({ ...draftHistory.getSnapshot().value, ...patch });
    },
    [draftHistory]
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // 原始 sheet 合并/样式（仅 XLSX 有意义）
  const [sheetMerges, setSheetMerges] = useState<
    Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>
  >([]);
  const [styleMap, setStyleMap] = useState<Record<string, React.CSSProperties>>({});

  const sourceRef = useRef<{
    fileId: string;
    source: string;
    workbook: XlsxDocument | null;
  } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ============== Column Visibility & Freeze ==============
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [frozenColumns, setFrozenColumns] = useState<number>(0); // Number of frozen columns from left

  // ============== Find & Replace ==============
  const [findReplace, setFindReplace] = useState<FindReplaceState>({
    isOpen: false,
    findText: '',
    replaceText: '',
    matchCase: false,
    matchWholeCell: false,
    currentMatchIndex: -1,
    matches: [],
  });

  // ============== Color Picker ==============
  const [showColorPicker, setShowColorPicker] = useState<'text' | 'background' | null>(null);
  const [selectedColor, setSelectedColor] = useState('#000000');

  useEffect(() => {
    if (!contextMenu) return;
    const menu = contextMenuRef.current;
    if (!menu) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) setContextMenu(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [contextMenu]);

  // ============== 解析 CSV/XLSX ==============
  useEffect(() => {
    const fileType = typeOverride || currentFile?.type;
    const content = currentFile?.content ?? '';
    const key = currentFile ? JSON.stringify([isInSplitView, currentFile.id, fileType]) : null;
    if (!editSession.receiveSource(key, content)) {
      if (sourceRef.current) sourceRef.current.source = content;
      return;
    }
    sourceRef.current = null;

    if (
      !currentFile ||
      (fileType !== 'csv' && fileType !== 'xlsx') ||
      (fileType === 'xlsx' && !content)
    ) {
      draftHistory.reset({ data: [], columns: [], cellFormats: {} });
      setSheetMerges([]);
      setStyleMap({});
      return;
    }

    setIsLoading(true);

    try {
      let workbook: XlsxDocument | null = null;
      let parsedData: CSVRow[] = [];
      let parsedColumns: ColumnInfo[] = [];
      const parsedFormats: Record<string, CellFormat> = {};
      let headers: string[] = [];

      if (fileType === 'xlsx') {
        const document = XlsxDocument.fromBase64(content);
        workbook = document;
        const grid = document.readGrid();
        const rows: string[][] = [];
        const nextStyleMap: Record<string, React.CSSProperties> = {};

        for (let r = 0; r < grid.cells.length; r++) {
          const row: string[] = [];
          for (let c = 0; c < grid.cells[r].length; c++) {
            const cell = grid.cells[r][c];
            let val = '';
            if (cell) {
              if (cell.w != null) val = String(cell.w);
              else if (cell.v != null) val = String(cell.v);

              // 样式 => CSS
              const s = cell.s;
              if (s) {
                const css: React.CSSProperties = {};

                // ===== 字体样式 =====
                if (s.font) {
                  // 粗体：常见字段有 bold / b（有的库用 1 表示 true）
                  const boldFlag = s.font.bold === true || s.font.b === true || s.font.b === 1;
                  if (boldFlag) css.fontWeight = 700;

                  // 斜体
                  const italicFlag = s.font.italic === true || s.font.i === true || s.font.i === 1;
                  if (italicFlag) css.fontStyle = 'italic';
                }

                // 处理其他字体属性
                if (s.font) {
                  // 处理颜色：可能是 rgb 或 theme/tint
                  if (s.font.color) {
                    if (s.font.color.rgb) {
                      // RGB 颜色可能是 6 位或 8 位（带 alpha）
                      let rgb = String(s.font.color.rgb);
                      if (rgb.length === 8) {
                        rgb = rgb.substring(2); // 移除前2位alpha
                      }
                      css.color = rgb.startsWith('#') ? rgb : `#${rgb}`;
                    } else if (s.font.color.theme !== undefined) {
                      // Excel 主题颜色映射
                      const themeColors = [
                        '#000000',
                        '#FFFFFF',
                        '#E7E6E6',
                        '#44546A',
                        '#5B9BD5',
                        '#ED7D31',
                        '#A5A5A5',
                        '#FFC000',
                        '#4472C4',
                        '#70AD47',
                      ];
                      const themeIndex = s.font.color.theme || 0;
                      css.color = themeColors[themeIndex] || '#000000';

                      // 应用 tint（色调）如果存在
                      if (s.font.color.tint && s.font.color.tint !== 0) {
                        // 简化的色调处理
                        const tint = s.font.color.tint;
                        if (tint < 0) {
                          // 变暗
                          css.filter = `brightness(${1 + tint})`;
                        } else {
                          // 变亮
                          css.filter = `brightness(${1 + tint * 0.5})`;
                        }
                      }
                    }
                  }

                  // 字体大小
                  if (s.font.sz) {
                    css.fontSize = `${s.font.sz}px`;
                  }

                  // 字体名称
                  if (s.font.name) {
                    css.fontFamily = s.font.name;
                  }
                }

                // 背景色 - 支持两种结构：s.fill 和直接在 s 上
                if (
                  s.fgColor?.rgb ||
                  s.bgColor?.rgb ||
                  (s.fill && (s.fill.fgColor?.rgb || s.fill.bgColor?.rgb))
                ) {
                  // 直接在样式对象上的颜色（新格式）
                  if (s.fgColor?.rgb) {
                    let rgb = String(s.fgColor.rgb);
                    if (rgb.length === 8) {
                      rgb = rgb.substring(2); // 移除前2位alpha
                    }
                    css.backgroundColor = rgb.startsWith('#') ? rgb : `#${rgb}`;
                  } else if (s.bgColor?.rgb) {
                    let rgb = String(s.bgColor.rgb);
                    if (rgb.length === 8) {
                      rgb = rgb.substring(2); // 移除前2位alpha
                    }
                    css.backgroundColor = rgb.startsWith('#') ? rgb : `#${rgb}`;
                  }
                  // 在 fill 对象中的颜色（旧格式）
                  else if (s.fill?.fgColor?.rgb) {
                    let rgb = String(s.fill.fgColor.rgb);
                    if (rgb.length === 8) {
                      rgb = rgb.substring(2); // 移除前2位alpha
                    }
                    css.backgroundColor = rgb.startsWith('#') ? rgb : `#${rgb}`;
                  } else if (s.fill?.bgColor?.rgb) {
                    let rgb = String(s.fill.bgColor.rgb);
                    if (rgb.length === 8) {
                      rgb = rgb.substring(2); // 移除前2位alpha
                    }
                    css.backgroundColor = rgb.startsWith('#') ? rgb : `#${rgb}`;
                  }
                }

                // 主题颜色背景
                if (s.fgColor?.theme !== undefined || s.fill?.fgColor?.theme !== undefined) {
                  const themeColors = [
                    '#000000',
                    '#FFFFFF',
                    '#E7E6E6',
                    '#44546A',
                    '#5B9BD5',
                    '#ED7D31',
                    '#A5A5A5',
                    '#FFC000',
                    '#4472C4',
                    '#70AD47',
                  ];
                  const themeColor = s.fgColor || s.fill?.fgColor;
                  const theme = themeColor.theme;
                  let bgColor = themeColors[theme] || '#FFFFFF';

                  // 应用 tint 到背景色
                  if (themeColor.tint && themeColor.tint !== 0) {
                    const tint = themeColor.tint;
                    if (tint < 0) {
                      // 变暗
                      css.backgroundColor = bgColor;
                      css.filter = `brightness(${1 + tint})`;
                    } else {
                      // 变亮
                      css.backgroundColor = bgColor;
                      css.filter = `brightness(${1 + tint * 0.5})`;
                    }
                  } else {
                    css.backgroundColor = bgColor;
                  }
                }

                // ===== 对齐 =====
                const a = s.alignment || s.align;
                if (a) {
                  const horiz = String(a.horizontal || a.h || '').toLowerCase();
                  const vert = String(a.vertical || a.v || '').toLowerCase();
                  (css as any).__horiz = horiz;
                  (css as any).__vert = vert;

                  // 设置传统 textAlign（兼容性）
                  if (horiz === 'center') css.textAlign = 'center';
                  else if (horiz === 'right') css.textAlign = 'right';
                  else css.textAlign = 'left';
                }

                // 边框样式
                if (s.border) {
                  const borderStyle = '1px solid #d1d5db'; // 默认边框样式
                  if (s.border.top) css.borderTop = borderStyle;
                  if (s.border.right) css.borderRight = borderStyle;
                  if (s.border.bottom) css.borderBottom = borderStyle;
                  if (s.border.left) css.borderLeft = borderStyle;
                }

                parsedFormats[`${r}:${c}`] = {
                  bold: Boolean(s.font?.bold),
                  italic: Boolean(s.font?.italic),
                  underline: Boolean(s.font?.underline),
                  textAlign: s.alignment?.horizontal,
                  color: typeof css.color === 'string' ? css.color : undefined,
                  backgroundColor:
                    typeof css.backgroundColor === 'string' ? css.backgroundColor : undefined,
                };

                // 只有当有实际样式时才添加到map
                if (Object.keys(css).length > 0) {
                  nextStyleMap[`${r}:${c}`] = css;
                }
              }
            }
            row.push(val);
          }
          rows.push(row);
        }

        setStyleMap(nextStyleMap);
        setSheetMerges(grid.merges);

        if (rows.length > 0) {
          const maxCols = Math.max(0, ...rows.map((r) => r.length));
          headers = Array.from({ length: maxCols }, (_, i) => getExcelColumnName(i));
          parsedData = rows.map((row) => {
            const obj: CSVRow = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] ?? '';
            });
            return obj;
          });
        }

        // Process column infos for XLSX
        const columnInfos: ColumnInfo[] = headers.map((h) => {
          const values = parsedData.map((row) => row[h]);
          const type = detectColumnType(values);
          return {
            key: h,
            displayName: h,
            width: columnWidths[h] || Math.max(100, Math.min(220, h.length * 10)),
            type: type as any,
          };
        });

        parsedColumns = columnInfos;
        setIsLoading(false);
      } else {
        const rows = parseTableCsv(content);
        const maxCols = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
        headers = Array.from({ length: maxCols }, (_, i) => getExcelColumnName(i));
        parsedData = rows.map((values) =>
          Object.fromEntries(headers.map((key, i) => [key, values[i] ?? '']))
        );
        setSheetMerges([]);
        setStyleMap({});
        parsedColumns = headers.map((key) => ({
          key,
          displayName: key,
          width: columnWidths[key] || Math.max(100, Math.min(220, key.length * 10)),
          type: detectColumnType(parsedData.map((row) => row[key])) as ColumnInfo['type'],
        }));
        setIsLoading(false);
      }
      draftHistory.reset({ data: parsedData, columns: parsedColumns, cellFormats: parsedFormats });
      sourceRef.current = { fileId: currentFile.id, source: content, workbook };
    } catch (err) {
      sourceRef.current = null;
      console.error('Failed to parse file:', err);
      draftHistory.reset({ data: [], columns: [], cellFormats: {} });
      setSheetMerges([]);
      setStyleMap({});
      setIsLoading(false);
    }
  }, [currentFile, typeOverride, isInSplitView, editSession, draftHistory]);

  useEffect(() => () => editSession.close(), [editSession]);

  // ============== 表格列定义 ==============
  const tableColumns = useMemo<ColumnDef<CSVRow, unknown>[]>(() => {
    return columns.map((col, colIndex) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => (
        <div className="relative flex items-center justify-between h-full">
          <div className="flex-1 flex items-center gap-1">
            <span className="text-xs font-medium truncate">{getExcelColumnName(colIndex)}</span>
            {column.getIsSorted() &&
              (column.getIsSorted() === 'asc' ? (
                <SortAsc className="w-3 h-3 text-theme-600" />
              ) : (
                <SortDesc className="w-3 h-3 text-theme-600" />
              ))}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              column.toggleSorting();
            }}
            aria-label={`Sort column ${col.displayName}`}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500" />
          </button>
          <div
            className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-theme-500"
            onMouseDown={(e) => {
              e.preventDefault();
              resizeHandleRef.current = {
                col: col.key,
                startX: e.clientX,
                startWidth: columnWidths[col.key] || col.width,
              };
            }}
          />
        </div>
      ),
      size: columnWidths[col.key] || col.width,
      // 单元格的渲染在 <tbody> 里处理 rowSpan/colSpan，这里只保留内容渲染逻辑
      cell: ({ getValue }) => {
        const value = getValue();
        return <span className="truncate">{formatCellValue(value, col.type)}</span>;
      },
    }));
  }, [columns, columnWidths]);

  // ============== 初始化表格 ==============
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visibleRows = table.getRowModel().rows;
  const rowOrder = useMemo(
    () => new SpreadsheetRowOrder(visibleRows.map((row) => row.index)),
    [visibleRows]
  );

  const selectedSourceRows = useMemo(
    () => new Set(selection ? rowOrder.between(selection.startRow, selection.endRow) : []),
    [selection, rowOrder]
  );

  const handleUndo = useCallback(() => {
    if (draftHistory.undo()) {
      setActiveCell(null);
      setSelection(null);
      setEditingCell(null);
      if (currentFile) setTabDirty(currentFile.id, true);
    }
  }, [draftHistory, currentFile, setTabDirty]);

  const handleRedo = useCallback(() => {
    if (draftHistory.redo()) {
      setActiveCell(null);
      setSelection(null);
      setEditingCell(null);
      if (currentFile) setTabDirty(currentFile.id, true);
    }
  }, [draftHistory, currentFile, setTabDirty]);

  // ============== Cell Formatting Functions ==============
  const getCellFormatKey = (row: number, col: number) => `${row}:${col}`;

  const applyFormatToSelection = useCallback(
    (format: Partial<CellFormat>) => {
      const newFormats = { ...cellFormats };
      if (selection) {
        const sc = Math.min(selection.startCol, selection.endCol);
        const ec = Math.max(selection.startCol, selection.endCol);
        for (const r of rowOrder.between(selection.startRow, selection.endRow)) {
          for (let c = sc; c <= ec; c++) {
            const key = getCellFormatKey(r, c);
            newFormats[key] = { ...newFormats[key], ...format };
          }
        }
      } else if (activeCell) {
        const key = getCellFormatKey(activeCell.row, activeCell.col);
        newFormats[key] = { ...newFormats[key], ...format };
      }
      commitDraft({ cellFormats: newFormats });
      if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
    },
    [cellFormats, selection, activeCell, commitDraft, setTabDirty, currentFile, rowOrder]
  );

  const toggleBold = useCallback(() => {
    const currentFormat =
      activeCell && cellFormats[getCellFormatKey(activeCell.row, activeCell.col)];
    applyFormatToSelection({ bold: !currentFormat?.bold });
  }, [activeCell, cellFormats, applyFormatToSelection]);

  const toggleItalic = useCallback(() => {
    const currentFormat =
      activeCell && cellFormats[getCellFormatKey(activeCell.row, activeCell.col)];
    applyFormatToSelection({ italic: !currentFormat?.italic });
  }, [activeCell, cellFormats, applyFormatToSelection]);

  const toggleUnderline = useCallback(() => {
    const currentFormat =
      activeCell && cellFormats[getCellFormatKey(activeCell.row, activeCell.col)];
    applyFormatToSelection({ underline: !currentFormat?.underline });
  }, [activeCell, cellFormats, applyFormatToSelection]);

  const setTextAlign = useCallback(
    (align: 'left' | 'center' | 'right') => {
      applyFormatToSelection({ textAlign: align });
    },
    [applyFormatToSelection]
  );

  const setTextColor = useCallback(
    (color: string) => {
      applyFormatToSelection({ color });
      setShowColorPicker(null);
    },
    [applyFormatToSelection]
  );

  const setBackgroundColor = useCallback(
    (color: string) => {
      applyFormatToSelection({ backgroundColor: color });
      setShowColorPicker(null);
    },
    [applyFormatToSelection]
  );

  const changeStructure = useCallback(
    (axis: 'row' | 'column', kind: 'insert' | 'delete', index: number) => {
      const current = draftHistory.getSnapshot().value;
      const size = axis === 'row' ? current.data.length : current.columns.length;
      if (kind === 'delete' && size <= 1) return;
      const change = new SpreadsheetStructureChange(axis, kind, index);
      const next = change.apply(current);
      draftHistory.commit(next);
      if (activeCell) {
        const previous = axis === 'row' ? activeCell.row : activeCell.col;
        const mapped = change.mapIndex(previous);
        const limit = axis === 'row' ? next.data.length : next.columns.length;
        setActiveCell({
          ...activeCell,
          [axis === 'row' ? 'row' : 'col']: Math.min(mapped ?? index, limit - 1),
        });
      }
      setSelection(null);
      setEditingCell(null);
      if (currentFile) setTabDirty(currentFile.id, true);
    },
    [draftHistory, activeCell, currentFile, setTabDirty]
  );

  const insertColumn = useCallback(
    (position: 'left' | 'right') => {
      if (activeCell)
        changeStructure('column', 'insert', activeCell.col + (position === 'right' ? 1 : 0));
    },
    [activeCell, changeStructure]
  );

  const deleteColumn = useCallback(() => {
    if (activeCell) changeStructure('column', 'delete', activeCell.col);
  }, [activeCell, changeStructure]);

  const toggleColumnVisibility = useCallback((colKey: string) => {
    setHiddenColumns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(colKey)) {
        newSet.delete(colKey);
      } else {
        newSet.add(colKey);
      }
      return newSet;
    });
  }, []);

  const toggleFreezeColumns = useCallback(() => {
    if (!activeCell) return;
    setFrozenColumns((prev) => (prev === activeCell.col + 1 ? 0 : activeCell.col + 1));
  }, [activeCell]);

  // ============== Find & Replace Functions ==============
  const performFind = useCallback(() => {
    if (!findReplace.findText) {
      setFindReplace((prev) => ({ ...prev, matches: [], currentMatchIndex: -1 }));
      return;
    }
    const matches: Array<{ row: number; col: number }> = [];
    const searchText = findReplace.matchCase
      ? findReplace.findText
      : findReplace.findText.toLowerCase();
    data.forEach((row, rowIndex) => {
      columns.forEach((col, colIndex) => {
        let cellValue = String(row[col.key] ?? '');
        if (!findReplace.matchCase) cellValue = cellValue.toLowerCase();
        const isMatch = findReplace.matchWholeCell
          ? cellValue === searchText
          : cellValue.includes(searchText);
        if (isMatch) {
          matches.push({ row: rowIndex, col: colIndex });
        }
      });
    });
    setFindReplace((prev) => ({
      ...prev,
      matches,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
    }));
    if (matches.length > 0) {
      setActiveCell(matches[0]);
    }
  }, [findReplace.findText, findReplace.matchCase, findReplace.matchWholeCell, data, columns]);

  const findNext = useCallback(() => {
    if (findReplace.matches.length === 0) return;
    const nextIndex = (findReplace.currentMatchIndex + 1) % findReplace.matches.length;
    setFindReplace((prev) => ({ ...prev, currentMatchIndex: nextIndex }));
    setActiveCell(findReplace.matches[nextIndex]);
  }, [findReplace.matches, findReplace.currentMatchIndex]);

  const findPrevious = useCallback(() => {
    if (findReplace.matches.length === 0) return;
    const prevIndex =
      (findReplace.currentMatchIndex - 1 + findReplace.matches.length) % findReplace.matches.length;
    setFindReplace((prev) => ({ ...prev, currentMatchIndex: prevIndex }));
    setActiveCell(findReplace.matches[prevIndex]);
  }, [findReplace.matches, findReplace.currentMatchIndex]);

  const replaceOne = useCallback(() => {
    if (findReplace.currentMatchIndex < 0 || findReplace.matches.length === 0) return;
    const match = findReplace.matches[findReplace.currentMatchIndex];
    const newData = data.map((row) => ({ ...row }));
    const colKey = columns[match.col].key;
    let cellValue = String(newData[match.row][colKey] ?? '');
    if (findReplace.matchWholeCell) {
      cellValue = findReplace.replaceText;
    } else {
      const regex = new RegExp(
        findReplace.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        findReplace.matchCase ? 'g' : 'gi'
      );
      cellValue = cellValue.replace(regex, findReplace.replaceText);
    }
    newData[match.row][colKey] = cellValue;
    commitDraft({ data: newData });
    if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
    // Re-run find
    setTimeout(performFind, 0);
  }, [
    findReplace.currentMatchIndex,
    findReplace.matches,
    findReplace.matchWholeCell,
    findReplace.replaceText,
    findReplace.findText,
    findReplace.matchCase,
    data,
    columns,
    commitDraft,
    setTabDirty,
    currentFile,
    performFind,
  ]);

  const replaceAll = useCallback(() => {
    if (findReplace.matches.length === 0) return;
    const newData = data.map((row) => ({ ...row }));
    const regex = new RegExp(
      findReplace.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      findReplace.matchCase ? 'g' : 'gi'
    );
    findReplace.matches.forEach((match) => {
      const colKey = columns[match.col].key;
      let cellValue = String(newData[match.row][colKey] ?? '');
      if (findReplace.matchWholeCell) {
        cellValue = findReplace.replaceText;
      } else {
        cellValue = cellValue.replace(regex, findReplace.replaceText);
      }
      newData[match.row][colKey] = cellValue;
    });
    commitDraft({ data: newData });
    if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
    setFindReplace((prev) => ({ ...prev, matches: [], currentMatchIndex: -1 }));
  }, [
    findReplace.matches,
    findReplace.findText,
    findReplace.matchCase,
    findReplace.matchWholeCell,
    findReplace.replaceText,
    data,
    commitDraft,
    setTabDirty,
    currentFile,
    columns,
  ]);

  // ============== 合并单元格映射（关键新增） ==============
  // 使用数据区坐标（rowIndex/colIndex）
  const { spanMap, coveredSet } = useMemo(() => {
    const map: Record<string, { rowSpan: number; colSpan: number }> = {};
    const covered = new Set<string>();

    if (sheetMerges.length > 0 && columns.length > 0 && data.length > 0) {
      sheetMerges.forEach((m) => {
        // 映射到数据区
        const r0Data = m.s.r;
        const r1Data = m.e.r;
        const c0Data = m.s.c;
        const c1Data = m.e.c;

        // 若合并在表头（数据区上方），忽略
        if (r1Data < 0) return;

        // clamp 到数据区边界
        const startR = Math.max(0, r0Data);
        const endR = Math.min(data.length - 1, r1Data);
        const startC = Math.max(0, c0Data);
        const endC = Math.min(columns.length - 1, c1Data);

        if (startR > endR || startC > endC) return;

        const key = `${startR}:${startC}`;
        map[key] = { rowSpan: endR - startR + 1, colSpan: endC - startC + 1 };

        for (let r = startR; r <= endR; r++) {
          for (let c = startC; c <= endC; c++) {
            if (!(r === startR && c === startC)) covered.add(`${r}:${c}`);
          }
        }
      });
    }
    return { spanMap: map, coveredSet: covered };
  }, [sheetMerges, data.length, columns.length]);

  // ============== 列宽拖拽 ==============
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeHandleRef.current) return;
      const { col, startX, startWidth } = resizeHandleRef.current;
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      setColumnWidths((prev) => ({ ...prev, [col]: newWidth }));
    };
    const handleMouseUp = () => {
      resizeHandleRef.current = null;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // ============== 键盘导航 & 快捷键 ==============
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Global shortcuts (work even without active cell)
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (isMeta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (isMeta && e.key === 'f') {
        e.preventDefault();
        setFindReplace((prev) => ({ ...prev, isOpen: true }));
        return;
      }

      if (!activeCell || editingCell) return;

      // Formatting shortcuts
      if (isMeta && e.key === 'b') {
        e.preventDefault();
        toggleBold();
        return;
      }
      if (isMeta && e.key === 'i') {
        e.preventDefault();
        toggleItalic();
        return;
      }
      if (isMeta && e.key === 'u') {
        e.preventDefault();
        toggleUnderline();
        return;
      }

      const { row, col } = activeCell;
      let newRow = row,
        newCol = col;
      switch (e.key) {
        case 'ArrowUp':
          newRow = rowOrder.move(row, -1);
          break;
        case 'ArrowDown':
          newRow = rowOrder.move(row, 1);
          break;
        case 'ArrowLeft':
          newCol = Math.max(0, col - 1);
          break;
        case 'ArrowRight':
          newCol = Math.min(columns.length - 1, col + 1);
          break;
        case 'Enter':
          setEditingCell({ row, col });
          setEditValue(String(data[row][columns[col].key] ?? ''));
          return;
        case 'Delete': {
          const newData = data.map((row) => ({ ...row }));
          newData[row][columns[col].key] = '';
          commitDraft({ data: newData });
          if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
          return;
        }
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            newCol = Math.max(0, col - 1);
          } else {
            newCol = Math.min(columns.length - 1, col + 1);
          }
          break;
      }
      if (newRow !== row || newCol !== col) {
        e.preventDefault();
        setActiveCell({ row: newRow, col: newCol });
        if (e.shiftKey && e.key !== 'Tab') {
          if (!selection)
            setSelection({ startRow: row, startCol: col, endRow: newRow, endCol: newCol });
          else setSelection({ ...selection, endRow: newRow, endCol: newCol });
        } else setSelection(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    activeCell,
    editingCell,
    data,
    columns,
    selection,
    setTabDirty,
    currentFile,
    handleUndo,
    handleRedo,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    commitDraft,
    rowOrder,
  ]);

  // ============== 复制/粘贴（原样保留） ==============
  const handleCopy = useCallback(() => {
    if (!activeCell) return;
    let textToCopy = '';
    if (selection) {
      const sc = Math.min(selection.startCol, selection.endCol);
      const ec = Math.max(selection.startCol, selection.endCol);
      const rowsArr: string[] = [];
      for (const r of rowOrder.between(selection.startRow, selection.endRow)) {
        const colsArr: string[] = [];
        for (let c = sc; c <= ec; c++) colsArr.push(String(data[r][columns[c].key] ?? ''));
        rowsArr.push(colsArr.join('\t'));
      }
      textToCopy = rowsArr.join('\n');
    } else {
      textToCopy = String(data[activeCell.row][columns[activeCell.col].key] ?? '');
    }
    navigator.clipboard.writeText(textToCopy);
  }, [activeCell, selection, rowOrder, data, columns]);

  const handlePaste = useCallback(async () => {
    if (!activeCell) return;
    const ticket = editSession.beginDeferredEdit();
    if (!ticket) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!editSession.completeDeferredEdit(ticket, true)) return;
      const rows = text.split('\n').map((row) => row.split('\t'));
      const newData = data.map((row) => ({ ...row }));
      const startRow = activeCell.row,
        startCol = activeCell.col;
      rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          const tr = rowOrder.offset(startRow, r),
            tc = startCol + c;
          if (tr !== null && tc < columns.length) newData[tr][columns[tc].key] = cell;
        });
      });
      commitDraft({ data: newData });
      if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
    } catch (err) {
      editSession.completeDeferredEdit(ticket, false);
      console.error('Failed to paste:', err);
    }
  }, [activeCell, data, commitDraft, setTabDirty, currentFile, rowOrder, columns, editSession]);

  // ============== Export / save ==============
  const handleExport = useCallback(() => {
    const csvContent = serializeTableCsv(data, columns);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentFile?.name || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, columns, currentFile]);

  const handleSave = useCallback(async () => {
    if (!currentFile) return;
    try {
      const isWorkbook = (typeOverride || currentFile.type) === 'xlsx';
      const source = sourceRef.current;
      if (
        !source ||
        source.fileId !== currentFile.id ||
        source.source !== currentFile.content ||
        (isWorkbook && !source.workbook)
      ) {
        throw new Error('Spreadsheet is not ready for saving');
      }
      const content = isWorkbook
        ? source.workbook!.serialize(data, columns, cellFormats)
        : serializeTableCsv(data, columns);
      const ticket = editSession.beginSave(content);
      try {
        const saved = await usePreviewStore.getState().updatePreviewFileContent(content, {
          surface: isInSplitView ? 'split' : 'normal',
          fileId: currentFile.id,
        });
        if (editSession.completeSave(ticket, saved?.content ?? null))
          setTabDirty(currentFile.id, false);
      } catch (error) {
        editSession.completeSave(ticket, null);
        throw error;
      }
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [
    currentFile,
    data,
    columns,
    cellFormats,
    setTabDirty,
    isInSplitView,
    typeOverride,
    editSession,
  ]);

  if (
    !currentFile ||
    (currentFile.type !== 'csv' && currentFile.type !== 'xlsx' && !typeOverride)
  ) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center p-8 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
          <FileSpreadsheet className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">
            No spreadsheet file selected
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50/80 to-gray-100/80 dark:from-gray-900/80 dark:to-gray-800/80">
      {/* Toolbar */}
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
          {/* File Operations */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className="px-2.5 py-1.5 text-sm bg-gradient-to-r from-theme-500 to-theme-600 text-white rounded-lg hover:from-theme-600 hover:to-theme-700 flex items-center gap-1.5 shadow-sm transition-all duration-200 hover:shadow-md"
              title="Save (Ctrl+S)"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={handleExport}
              className="px-2.5 py-1.5 text-sm bg-white/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-white dark:hover:bg-gray-600 flex items-center gap-1.5 border border-gray-200/50 dark:border-gray-600/50 shadow-sm transition-all duration-200"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-gray-300/50 dark:bg-gray-600/50" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg hover:bg-gray-100/70 dark:hover:bg-gray-700/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg hover:bg-gray-100/70 dark:hover:bg-gray-700/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          <div className="h-5 w-px bg-gray-300/50 dark:bg-gray-600/50" />

          {/* Text Formatting */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleBold}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCell && cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.bold
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={toggleItalic}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCell && cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.italic
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={toggleUnderline}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCell &&
                cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.underline
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-gray-300/50 dark:bg-gray-600/50" />

          {/* Alignment */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTextAlign('left')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCell &&
                cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.textAlign === 'left'
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title="Align Left"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTextAlign('center')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCell &&
                cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.textAlign ===
                  'center'
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title="Align Center"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTextAlign('right')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCell &&
                cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.textAlign === 'right'
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title="Align Right"
            >
              <AlignRight className="w-4 h-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-gray-300/50 dark:bg-gray-600/50" />

          {/* Colors */}
          <div className="flex items-center gap-1 relative">
            <button
              onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')}
              className="p-1.5 rounded-lg hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors relative"
              title="Text Color"
            >
              <Palette className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <div
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
                style={{
                  backgroundColor:
                    (activeCell &&
                      cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]?.color) ||
                    '#000000',
                }}
              />
            </button>
            <button
              onClick={() =>
                setShowColorPicker(showColorPicker === 'background' ? null : 'background')
              }
              className="p-1.5 rounded-lg hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors relative"
              title="Background Color"
            >
              <PaintBucket className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <div
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
                style={{
                  backgroundColor:
                    (activeCell &&
                      cellFormats[getCellFormatKey(activeCell.row, activeCell.col)]
                        ?.backgroundColor) ||
                    '#ffffff',
                }}
              />
            </button>
            {/* Color Picker Dropdown */}
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50 z-50">
                <div className="grid grid-cols-8 gap-1">
                  {[
                    '#000000',
                    '#434343',
                    '#666666',
                    '#999999',
                    '#b7b7b7',
                    '#cccccc',
                    '#d9d9d9',
                    '#ffffff',
                    '#980000',
                    '#ff0000',
                    '#ff9900',
                    '#ffff00',
                    '#00ff00',
                    '#00ffff',
                    '#4a86e8',
                    '#0000ff',
                    '#9900ff',
                    '#ff00ff',
                    '#e6b8af',
                    '#f4cccc',
                    '#fce5cd',
                    '#fff2cc',
                    '#d9ead3',
                    '#d0e0e3',
                    '#c9daf8',
                    '#cfe2f3',
                    '#d9d2e9',
                    '#ead1dc',
                    '#dd7e6b',
                    '#ea9999',
                    '#f9cb9c',
                    '#ffe599',
                  ].map((color) => (
                    <button
                      key={color}
                      className="w-5 h-5 rounded border border-gray-300/50 dark:border-gray-600/50 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        showColorPicker === 'text' ? setTextColor(color) : setBackgroundColor(color)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-gray-300/50 dark:bg-gray-600/50" />

          {/* Find & Replace */}
          <button
            onClick={() => setFindReplace((prev) => ({ ...prev, isOpen: true }))}
            className="p-1.5 rounded-lg hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
            title="Find & Replace (Ctrl+F)"
          >
            <Search className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>

          {/* Freeze Columns */}
          {activeCell && (
            <button
              onClick={toggleFreezeColumns}
              className={`p-1.5 rounded-lg transition-colors ${
                frozenColumns > 0
                  ? 'bg-theme-100 dark:bg-theme-900/50 text-theme-600 dark:text-theme-400'
                  : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
              title={frozenColumns > 0 ? 'Unfreeze Columns' : 'Freeze Columns'}
            >
              {frozenColumns > 0 ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          )}

          {/* File Name */}
          <div className="flex items-center gap-2 ml-auto px-3 py-1 rounded-lg bg-gray-100/50 dark:bg-gray-700/50">
            <FileSpreadsheet className="w-4 h-4 text-theme-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {currentFile.name}
            </span>
          </div>
        </div>
      </div>

      {/* Formula Bar */}
      {showFormulaBar && activeCell && (
        <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-b border-gray-200/30 dark:border-gray-700/30 px-3 py-1.5 flex items-center gap-2">
          <div className="px-2.5 py-1 bg-theme-100/80 dark:bg-theme-900/30 text-sm font-mono text-theme-700 dark:text-theme-300 rounded-md border border-theme-200/50 dark:border-theme-700/50">
            {getCellAddress(activeCell.row, activeCell.col)}
          </div>
          <input
            type="text"
            value={
              editingCell
                ? editValue
                : String(data[activeCell.row]?.[columns[activeCell.col]?.key] ?? '')
            }
            onChange={(e) => {
              if (editingCell) setEditValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !editingCell) {
                setEditingCell(activeCell);
                setEditValue(String(data[activeCell.row][columns[activeCell.col].key] ?? ''));
              }
            }}
            className="flex-1 px-3 py-1 text-sm border border-gray-200/50 dark:border-gray-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-500/30 focus:border-theme-500 bg-white/80 dark:bg-gray-900/80 text-gray-900 dark:text-gray-100 transition-all duration-200"
          />
        </div>
      )}

      {/* Grid */}
      <div
        ref={tableContainerRef}
        className="flex-1 h-full overflow-hidden bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm relative rounded-lg m-2 border border-gray-200/50 dark:border-gray-700/50 shadow-sm"
      >
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-md rounded-lg">
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-white/80 dark:bg-gray-800/80 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
              <div className="w-10 h-10 border-3 border-theme-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Loading data...
              </div>
            </div>
          </div>
        )}
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => {
            if (height <= 32 || width === 0) {
              return (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Loading...
                </div>
              );
            }

            return (
              <div style={{ height, width, overflow: 'auto' }}>
                <div
                  style={{ minWidth: '100%', width: Math.max(width, table.getTotalSize() + 48) }}
                >
                  {/* Header */}
                  <div className="sticky top-0 z-10 flex bg-gradient-to-b from-gray-100/95 to-gray-50/95 dark:from-gray-800/95 dark:to-gray-800/90 backdrop-blur-sm border-b border-gray-200/70 dark:border-gray-700/70">
                    <div className="sticky left-0 z-20 bg-gradient-to-b from-gray-100/95 to-gray-50/95 dark:from-gray-800/95 dark:to-gray-800/90 backdrop-blur-sm border-r border-gray-200/70 dark:border-gray-700/70 w-12 h-9 flex-shrink-0" />
                    {table.getHeaderGroups()[0]?.headers.map((header) => (
                      <div
                        key={header.id}
                        className="bg-gradient-to-b from-gray-100/95 to-gray-50/95 dark:from-gray-800/95 dark:to-gray-800/90 backdrop-blur-sm border-r border-gray-200/70 dark:border-gray-700/70 h-9 px-2 text-left relative text-gray-700 dark:text-gray-200 flex-shrink-0 font-medium"
                        style={{ width: header.getSize() }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    ))}
                  </div>

                  {/* Body */}
                  <List<SpreadsheetRowRenderer>
                    height={height - 32} // Subtract header height
                    itemCount={table.getRowModel().rows.length}
                    itemSize={28} // Row height
                    width={Math.max(width, table.getTotalSize() + 48)} // Ensure width covers all columns + row number col
                    itemData={(index, style) => {
                      const row = table.getRowModel().rows[index];
                      const sourceRow = row.index;
                      const isEvenRow = index % 2 === 0;
                      return (
                        <div
                          key={row.id}
                          style={style}
                          className={`flex ${isEvenRow ? 'bg-white/50 dark:bg-gray-900/50' : 'bg-gray-50/50 dark:bg-gray-800/30'}`}
                        >
                          {/* Row number */}
                          <div className="sticky left-0 z-10 bg-gradient-to-r from-gray-100/95 to-gray-50/90 dark:from-gray-800/95 dark:to-gray-800/80 backdrop-blur-sm border-r border-b border-gray-200/50 dark:border-gray-700/50 w-12 h-full text-center text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center flex-shrink-0 font-medium">
                            {index + 1}
                          </div>
                          {/* Data cells with merge support */}
                          {row.getVisibleCells().map((cell) => {
                            const colId = cell.column.id;
                            const colIndex = columns.findIndex((c) => c.key === colId);
                            const dataKey = `${sourceRow}:${colIndex}`;

                            if (coveredSet.has(dataKey)) return null;

                            const xlsCss = styleMap[dataKey] || {};

                            // 拆分成"单元格级样式（背景/对齐）"与"文本级样式（粗斜体/颜色）"
                            const cellStyle: React.CSSProperties = {};
                            const textStyle: React.CSSProperties = {};

                            // Get custom cell format
                            const customFormat = cellFormats[getCellFormatKey(sourceRow, colIndex)];

                            // 背景色 -> <td> (custom format takes priority)
                            if (customFormat?.backgroundColor) {
                              cellStyle.backgroundColor = customFormat.backgroundColor;
                            } else if (xlsCss.backgroundColor) {
                              cellStyle.backgroundColor = xlsCss.backgroundColor;
                            }
                            // 水平对齐 -> <td> (custom format takes priority)
                            if (customFormat?.textAlign) {
                              cellStyle.textAlign = customFormat.textAlign;
                            } else if (xlsCss.textAlign) {
                              cellStyle.textAlign = xlsCss.textAlign as any;
                            }
                            // 垂直对齐：Excel 的 center 映射为 HTML 的 middle
                            if (xlsCss.verticalAlign) {
                              const v = String(xlsCss.verticalAlign).toLowerCase();
                              cellStyle.verticalAlign = (v === 'center' ? 'middle' : v) as any;
                            } else {
                              cellStyle.verticalAlign = 'middle';
                            }

                            // 文本样式 -> 内层 <div>/<span> (merge xlsCss and custom format)
                            textStyle.fontWeight =
                              customFormat?.bold !== undefined
                                ? customFormat.bold
                                  ? 700
                                  : 400
                                : xlsCss.fontWeight;
                            textStyle.fontStyle =
                              customFormat?.italic !== undefined
                                ? customFormat.italic
                                  ? 'italic'
                                  : 'normal'
                                : xlsCss.fontStyle;
                            textStyle.textDecoration = customFormat?.underline
                              ? 'underline'
                              : 'none';
                            if (customFormat?.color) {
                              textStyle.color = customFormat.color;
                            } else if (xlsCss.color) {
                              textStyle.color = xlsCss.color;
                            }

                            // 数字默认右对齐（若未指定）
                            if (columns[colIndex]?.type === 'number' && !cellStyle.textAlign) {
                              cellStyle.textAlign = 'right';
                            }

                            // 提取对齐信息用于 flex 布局
                            const horiz =
                              customFormat?.textAlign ??
                              ((xlsCss as any).__horiz as string | undefined);
                            const vert = (xlsCss as any).__vert as string | undefined;

                            const justifyContent =
                              horiz === 'center'
                                ? 'center'
                                : horiz === 'right'
                                  ? 'flex-end'
                                  : // 数字列默认右对齐
                                    columns[colIndex]?.type === 'number' && !horiz
                                    ? 'flex-end'
                                    : 'flex-start';

                            const alignItems =
                              vert === 'center'
                                ? 'center'
                                : vert === 'bottom'
                                  ? 'flex-end'
                                  : 'flex-start';

                            const isActive = !!(
                              activeCell &&
                              activeCell.row === sourceRow &&
                              activeCell.col === colIndex
                            );
                            const inSelection = !!(
                              selection &&
                              rowOrder
                                .between(selection.startRow, selection.endRow)
                                .includes(sourceRow) &&
                              colIndex >= Math.min(selection.startCol, selection.endCol) &&
                              colIndex <= Math.max(selection.startCol, selection.endCol)
                            );

                            // 若单元格有背景色，则选区不再加蓝底，只加描边；否则才用蓝底
                            const selectionBgClass =
                              inSelection && !isActive && !cellStyle.backgroundColor
                                ? 'bg-theme-50 dark:bg-theme-900/30'
                                : '';

                            return (
                              <div
                                key={cell.id}
                                className={`border-r border-b border-gray-200/60 dark:border-gray-700/60 p-0 align-middle ${selectionBgClass} ${isActive ? 'ring-2 ring-theme-500/70 ring-inset shadow-sm' : ''} text-gray-900 dark:text-gray-100 flex-shrink-0 transition-all duration-150 hover:bg-gray-50/50 dark:hover:bg-gray-800/50`}
                                style={{
                                  width: cell.column.getSize(),
                                  ...cellStyle,
                                  display: 'flex',
                                  height: '100%',
                                  // rowSpan/colSpan not supported in flex layout easily, but keeping logic for reference or future grid support
                                  // For now, flex layout assumes no spans or handles them via width adjustments if implemented
                                }}
                                onClick={() => {
                                  setActiveCell({ row: sourceRow, col: colIndex });
                                  setSelection(null);
                                }}
                                onDoubleClick={() => {
                                  setActiveCell({ row: sourceRow, col: colIndex });
                                  setEditingCell({ row: sourceRow, col: colIndex });
                                  setEditValue(
                                    String(data[sourceRow][columns[colIndex].key] ?? '')
                                  );
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setActiveCell({ row: sourceRow, col: colIndex });
                                  setContextMenu({ x: e.clientX, y: e.clientY });
                                }}
                              >
                                <div
                                  className="relative h-full min-h-[28px] flex px-2 text-sm"
                                  style={{
                                    ...textStyle,
                                    justifyContent,
                                    alignItems,
                                    width: '100%',
                                  }}
                                >
                                  {editingCell &&
                                  editingCell.row === sourceRow &&
                                  editingCell.col === colIndex ? (
                                    <input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={() => {
                                        const newData = data.map((row) => ({ ...row }));
                                        newData[sourceRow][columns[colIndex].key] = editValue;
                                        commitDraft({ data: newData });
                                        setEditingCell(null);
                                        if (setTabDirty && currentFile)
                                          setTabDirty(currentFile.id, true);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter')
                                          (e.currentTarget as HTMLInputElement).blur();
                                        else if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      className="absolute inset-0 w-full h-full px-2 border-2 border-theme-500/70 focus:outline-none focus:border-theme-500 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm text-gray-900 dark:text-gray-100 shadow-lg rounded-sm"
                                      style={{ textAlign: cellStyle.textAlign || 'left' }}
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="truncate" style={{ width: '100%' }}>
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  >
                    {VirtualSpreadsheetRow}
                  </List>
                </div>
              </div>
            );
          }}
        </AutoSizer>
      </div>

      {/* Status Bar */}
      <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 px-4 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500/80 animate-pulse" />
            <span className="text-gray-600 dark:text-gray-400 font-medium">Ready</span>
          </div>
          {selection && (
            <span className="px-2 py-0.5 bg-theme-100/50 dark:bg-theme-900/30 text-theme-700 dark:text-theme-300 rounded-md">
              {selectedSourceRows.size} × {Math.abs(selection.endCol - selection.startCol) + 1}{' '}
              cells selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">{data.length}</span> rows
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">{columns.length}</span>{' '}
            columns
          </span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl py-1.5 z-50 min-w-[200px]"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          {/* Clipboard Operations */}
          <button
            onClick={() => {
              handleCopy();
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Copy className="w-4 h-4 text-gray-500" /> Copy
            <span className="ml-auto text-xs text-gray-400">⌘C</span>
          </button>
          <button
            onClick={() => {
              handlePaste();
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Clipboard className="w-4 h-4 text-gray-500" /> Paste
            <span className="ml-auto text-xs text-gray-400">⌘V</span>
          </button>
          <button
            onClick={() => {
              if (activeCell) {
                const newData = data.map((row) => ({ ...row }));
                newData[activeCell.row][columns[activeCell.col].key] = '';
                commitDraft({ data: newData });
                if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
              }
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-gray-500" /> Clear Contents
            <span className="ml-auto text-xs text-gray-400">Del</span>
          </button>

          <div className="border-t border-gray-200/50 dark:border-gray-700/50 my-1.5 mx-2" />

          {/* Row Operations */}
          <div className="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">
            Rows
          </div>
          <button
            onClick={() => {
              if (activeCell) changeStructure('row', 'insert', activeCell.row + 0);
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Plus className="w-4 h-4 text-gray-500" /> Insert Row Above
          </button>
          <button
            onClick={() => {
              if (activeCell) changeStructure('row', 'insert', activeCell.row + 1);
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Plus className="w-4 h-4 text-gray-500" /> Insert Row Below
          </button>
          <button
            onClick={() => {
              if (activeCell) changeStructure('row', 'delete', activeCell.row + 0);
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/30 transition-colors"
          >
            <Minus className="w-4 h-4" /> Delete Row
          </button>

          <div className="border-t border-gray-200/50 dark:border-gray-700/50 my-1.5 mx-2" />

          {/* Column Operations */}
          <div className="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">
            Columns
          </div>
          <button
            onClick={() => {
              insertColumn('left');
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Plus className="w-4 h-4 text-gray-500" /> Insert Column Left
          </button>
          <button
            onClick={() => {
              insertColumn('right');
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Plus className="w-4 h-4 text-gray-500" /> Insert Column Right
          </button>
          <button
            onClick={() => {
              deleteColumn();
              setContextMenu(null);
            }}
            disabled={columns.length <= 1}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
          >
            <Minus className="w-4 h-4" /> Delete Column
          </button>
          {activeCell && (
            <button
              onClick={() => {
                toggleColumnVisibility(columns[activeCell.col].key);
                setContextMenu(null);
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
            >
              <EyeOff className="w-4 h-4 text-gray-500" /> Hide Column
            </button>
          )}

          <div className="border-t border-gray-200/50 dark:border-gray-700/50 my-1.5 mx-2" />

          {/* Formatting */}
          <div className="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">
            Format
          </div>
          <button
            onClick={() => {
              toggleBold();
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Bold className="w-4 h-4 text-gray-500" /> Bold
            <span className="ml-auto text-xs text-gray-400">⌘B</span>
          </button>
          <button
            onClick={() => {
              toggleItalic();
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-colors"
          >
            <Italic className="w-4 h-4 text-gray-500" /> Italic
            <span className="ml-auto text-xs text-gray-400">⌘I</span>
          </button>
        </div>
      )}

      {/* Find & Replace Dialog */}
      {findReplace.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20 backdrop-blur-sm">
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 w-[400px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Search className="w-4 h-4" />
                Find & Replace
              </h3>
              <button
                onClick={() => setFindReplace((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Find Input */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Find</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={findReplace.findText}
                    onChange={(e) =>
                      setFindReplace((prev) => ({ ...prev, findText: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') performFind();
                    }}
                    placeholder="Search text..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-500/30 focus:border-theme-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                  <button
                    onClick={performFind}
                    className="px-3 py-2 text-sm bg-theme-500 text-white rounded-lg hover:bg-theme-600 transition-colors"
                  >
                    Find
                  </button>
                </div>
              </div>

              {/* Replace Input */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Replace with
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={findReplace.replaceText}
                    onChange={(e) =>
                      setFindReplace((prev) => ({ ...prev, replaceText: e.target.value }))
                    }
                    placeholder="Replace text..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-500/30 focus:border-theme-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={replaceOne}
                    disabled={findReplace.matches.length === 0}
                    className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
                  >
                    Replace
                  </button>
                  <button
                    onClick={replaceAll}
                    disabled={findReplace.matches.length === 0}
                    className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
                  >
                    All
                  </button>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={findReplace.matchCase}
                    onChange={(e) =>
                      setFindReplace((prev) => ({ ...prev, matchCase: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-theme-500 focus:ring-theme-500"
                  />
                  Match case
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={findReplace.matchWholeCell}
                    onChange={(e) =>
                      setFindReplace((prev) => ({ ...prev, matchWholeCell: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-theme-500 focus:ring-theme-500"
                  />
                  Whole cell
                </label>
              </div>

              {/* Results */}
              {findReplace.matches.length > 0 && (
                <div className="flex items-center justify-between pt-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {findReplace.currentMatchIndex + 1} of {findReplace.matches.length} matches
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={findPrevious}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Previous"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-180" />
                    </button>
                    <button
                      onClick={findNext}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Next"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              )}
              {findReplace.findText && findReplace.matches.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 pt-2">
                  No matches found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetEditor;
