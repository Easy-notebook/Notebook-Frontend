import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx-js-style';
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
import {
  Download,
  ChevronDown,
  Copy,
  Clipboard,
  Trash2,
  Save,
  Home,
  FileSpreadsheet,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import usePreviewStore from '@Store/previewStore';
import useStore from '@Store/notebookStore';

// =====================================================
// Types & Interfaces
// =====================================================
export interface CSVRow {
  [key: string]: string | number | boolean | null | undefined;
}

interface CellSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface ColumnInfo {
  key: string;
  displayName: string;
  width: number;
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
}

// =====================================================
// Utilities
// =====================================================
const getExcelColumnName = (index: number): string => {
  let result = '';
  while (index >= 0) {
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26) - 1;
  }
  return result;
};

const getCellAddress = (row: number, col: number): string => {
  return `${getExcelColumnName(col)}${row + 1}`;
};

const formatCellValue = (value: any, type: string): string => {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'number': {
      const num = Number(String(value).replace(/,/g, ''));
      return isNaN(num) ? String(value) : num.toLocaleString(undefined, { maximumFractionDigits: 10 });
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
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (!nonEmpty.length) return 'string';
  const booleanValues = ['true', 'false', 'yes', 'no', '1', '0'];
  if (nonEmpty.every(v => booleanValues.includes(String(v).toLowerCase()))) return 'boolean';
  const numbers = nonEmpty.filter(v => {
    const s = String(v).replace(/,/g, '');
    return !isNaN(Number(s)) && s.trim() !== '';
  });
  if (numbers.length >= nonEmpty.length * 0.8) return 'number';
  const dates = nonEmpty.filter(v => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100;
  });
  if (dates.length >= nonEmpty.length * 0.8) return 'date';
  return 'string';
};

// =====================================================
// Context Menu Component（原样保留，略）
// =====================================================
interface ContextMenuProps {
  x: number; y: number;
  onClose: () => void; onCopy: () => void; onPaste: () => void; onDelete: () => void;
  onInsertRowAbove: () => void; onInsertRowBelow: () => void; onDeleteRow: () => void;
}
const ContextMenu: React.FC<ContextMenuProps> = (props) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) props.onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [props]);
  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50"
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
    >
      <button onClick={props.onCopy} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"><Copy className="w-4 h-4"/>Copy</button>
      <button onClick={props.onPaste} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"><Clipboard className="w-4 h-4"/>Paste</button>
      <div className="border-t border-gray-200 my-1" />
      <button onClick={props.onDelete} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"><Trash2 className="w-4 h-4"/>Clear Contents</button>
      <div className="border-t border-gray-200 my-1" />
      <button onClick={props.onInsertRowAbove} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Insert Row Above</button>
      <button onClick={props.onInsertRowBelow} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Insert Row Below</button>
      <button onClick={props.onDeleteRow} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Delete Row</button>
    </div>
  );
};

// =====================================================
// Main Component
// =====================================================
interface OfficeStyleCSVPreviewProps {
  typeOverride?: 'csv' | 'xlsx';
  showFormulaBar?: boolean;
}

const DataTable: React.FC<OfficeStyleCSVPreviewProps> = ({
  typeOverride, showFormulaBar = true
}) => {
  const { activeFile, activeSplitFile, setTabDirty } = usePreviewStore();
  const { detachedCellId } = useStore();
  
  // Check if we're in split view mode (detached cell)
  const isInSplitView = !!detachedCellId;
  const currentFile = isInSplitView ? activeSplitFile : activeFile;
  const [data, setData] = useState<CSVRow[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // 原始 sheet 合并/样式（仅 XLSX 有意义）
  const [sheetMerges, setSheetMerges] = useState<Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>>([]);
  const [styleMap, setStyleMap] = useState<Record<string, React.CSSProperties>>({});

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  // ============== 解析 CSV/XLSX ==============
  useEffect(() => {
    const fileType = typeOverride || currentFile?.type;
    const content = currentFile?.content ?? '';

    if (!content || (fileType !== 'csv' && fileType !== 'xlsx')) {
      setData([]); setColumns([]); setSheetMerges([]); setStyleMap({});
      return;
    }

    try {
      let parsedData: CSVRow[] = [];
      let headers: string[] = [];

      if (fileType === 'xlsx') {
        // base64 -> Uint8Array
        const bstr = atob(content);
        const bytes = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);

        // 读取工作簿，启用样式和其他格式选项
        const wb = XLSX.read(bytes, { 
          type: 'array', 
          cellStyles: true,  // 读取单元格样式
          cellNF: true,      // 读取数字格式
          cellDates: true,   // 解析日期
          sheetStubs: true   // 包含空单元格
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const ref = (ws as any)['!ref'] || 'A1';
        const range = XLSX.utils.decode_range(ref);
        const rows: any[][] = [];
        const nextStyleMap: Record<string, React.CSSProperties> = {};
        
        // 调试工作簿信息
        console.log('Workbook info:', { 
          sheetNames: wb.SheetNames,
          range: ref,
          hasStyles: 'Yes' // xlsx-js-style always has styles
        });

        for (let r = range.s.r; r <= range.e.r; r++) {
          const row: any[] = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell: any = (ws as any)[addr];
            let val = '';
            if (cell) {
              if (cell.w != null) val = String(cell.w);
              else if (cell.v != null) val = String(cell.v);
              
              // 调试第一行几个单元格的信息
              if (r < 2 && c < 5 && cell) {
                console.log(`Cell ${addr}:`, {
                  value: val,
                  hasStyle: !!cell.s,
                  styleKeys: cell.s ? Object.keys(cell.s) : [],
                  font: cell.s?.font,
                  alignment: cell.s?.alignment,
                  fill: cell.s?.fill,
                  fullStyle: cell.s,
                  raw: cell.v,
                  formatted: cell.w
                });
              }
              
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
                        '#000000', '#FFFFFF', '#E7E6E6', '#44546A', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47'
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
                if (s.fgColor?.rgb || s.bgColor?.rgb || (s.fill && (s.fill.fgColor?.rgb || s.fill.bgColor?.rgb))) {
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
                    '#000000', '#FFFFFF', '#E7E6E6', '#44546A', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47'
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
                  const vert  = String(a.vertical   || a.v || '').toLowerCase();
                  (css as any).__horiz = horiz;
                  (css as any).__vert  = vert;

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
                
                // 只有当有实际样式时才添加到map
                if (Object.keys(css).length > 0) {
                  nextStyleMap[`${r}:${c}`] = css;
                  
                  // 调试前几个有样式的单元格
                  if (Object.keys(nextStyleMap).length <= 3) {
                    console.log(`Adding styles for ${addr} (${r}:${c}):`, css);
                    console.log(`Original style object for ${addr}:`, s);
                  }
                }
              }
            }
            row.push(val);
          }
          rows.push(row);
        }

        // 调试：打印样式信息
        if (Object.keys(nextStyleMap).length > 0) {
          console.log('Loaded styles:', nextStyleMap);
          // 更详细的调试
          Object.entries(nextStyleMap).slice(0, 5).forEach(([key, style]) => {
            if (Object.keys(style).length > 0) {
              console.log(`Cell ${key} has styles:`, style);
            }
          });
        }
        
        setStyleMap(nextStyleMap);
        setSheetMerges(((ws as any)['!merges'] || []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>);

        if (rows.length > 0) {
          const maxCols = Math.max(0, ...rows.map(r => r.length));
          headers = Array.from({ length: maxCols }, (_, i) => getExcelColumnName(i));
          parsedData = rows.map(row => {
            const obj: CSVRow = {};
            headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
            return obj;
          });
        }
      } else {
        // CSV
        const lines = content.split(/\r?\n/);
        const rows = lines.map(line => line.split(',').map(v => v.trim()));
        if (rows.length > 0) {
          const maxCols = Math.max(0, ...rows.map(r => r.length));
          headers = Array.from({ length: maxCols }, (_, i) => getExcelColumnName(i));
          parsedData = rows.map(values => {
            const obj: CSVRow = {};
            headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
            return obj;
          });
        }
        // CSV 无 merges/styles
        setSheetMerges([]); setStyleMap({});
      }

      // 列信息与类型
      const columnInfos: ColumnInfo[] = headers.map((h) => {
        const values = parsedData.map(row => row[h]);
        const type = detectColumnType(values);
        return {
          key: h,
          displayName: h,
          width: columnWidths[h] || Math.max(100, Math.min(220, h.length * 10)),
          type: type as any
        };
      });

      setColumns(columnInfos);
      setData(parsedData);
    } catch (err) {
      console.error('Failed to parse file:', err);
      setData([]); setColumns([]);
      setSheetMerges([]); setStyleMap({});
    }
  }, [currentFile, typeOverride, columnWidths]);

  // ============== 合并单元格映射（关键新增） ==============
  // 使用数据区坐标（rowIndex/colIndex）
  const headerOffset = 0;
  const { spanMap, coveredSet } = useMemo(() => {
    const map: Record<string, { rowSpan: number; colSpan: number }> = {};
    const covered = new Set<string>();

    if (sheetMerges.length > 0 && columns.length > 0 && data.length > 0) {
      sheetMerges.forEach(m => {
        // 映射到数据区
        const r0Data = m.s.r - headerOffset;
        const r1Data = m.e.r - headerOffset;
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

  // ============== 表格列定义 ==============
  const tableColumns = useMemo<ColumnDef<CSVRow, unknown>[]>(() => {
    return columns.map((col, colIndex) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => (
        <div className="relative flex items-center justify-between h-full">
          <div className="flex-1 flex items-center gap-1">
            <span className="text-xs font-medium truncate">{getExcelColumnName(colIndex)}</span>
            {column.getIsSorted() && (column.getIsSorted() === 'asc'
              ? <SortAsc className="w-3 h-3 text-theme-600" />
              : <SortDesc className="w-3 h-3 text-theme-600" />
            )}
          </div>
          <button onClick={(e) => { e.stopPropagation(); column.toggleSorting(); }} className="p-0.5 hover:bg-gray-200 rounded">
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          <div
            className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-theme-500"
            onMouseDown={(e) => {
              e.preventDefault();
              resizeHandleRef.current = { col: col.key, startX: e.clientX, startWidth: (columnWidths[col.key] || col.width) };
            }}
          />
        </div>
      ),
      size: columnWidths[col.key] || col.width,
      // 单元格的渲染在 <tbody> 里处理 rowSpan/colSpan，这里只保留内容渲染逻辑
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <span className="truncate">{formatCellValue(value, col.type)}</span>
        );
      }
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

  // ============== 列宽拖拽 ==============
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeHandleRef.current) return;
      const { col, startX, startWidth } = resizeHandleRef.current;
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [col]: newWidth }));
    };
    const handleMouseUp = () => { resizeHandleRef.current = null; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, []);

  // ============== 键盘导航（原样保留） ==============
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeCell || editingCell) return;
      const { row, col } = activeCell;
      let newRow = row, newCol = col;
      switch (e.key) {
        case 'ArrowUp': newRow = Math.max(0, row - 1); break;
        case 'ArrowDown': newRow = Math.min(data.length - 1, row + 1); break;
        case 'ArrowLeft': newCol = Math.max(0, col - 1); break;
        case 'ArrowRight': newCol = Math.min(columns.length - 1, col + 1); break;
        case 'Enter':
          setEditingCell({ row, col });
          setEditValue(String(data[row][columns[col].key] ?? ''));
          return;
        case 'Delete': {
          const newData = [...data];
          newData[row][columns[col].key] = '';
          setData(newData);
          if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
          return;
        }
      }
      if (newRow !== row || newCol !== col) {
        e.preventDefault();
        setActiveCell({ row: newRow, col: newCol });
        if (e.shiftKey) {
          if (!selection) setSelection({ startRow: row, startCol: col, endRow: newRow, endCol: newCol });
          else setSelection({ ...selection, endRow: newRow, endCol: newCol });
        } else setSelection(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeCell, editingCell, data, columns, selection, setTabDirty, currentFile]);

  // ============== 复制/粘贴（原样保留） ==============
  const handleCopy = useCallback(() => {
    if (!activeCell) return;
    let textToCopy = '';
    if (selection) {
      const sr = Math.min(selection.startRow, selection.endRow);
      const er = Math.max(selection.startRow, selection.endRow);
      const sc = Math.min(selection.startCol, selection.endCol);
      const ec = Math.max(selection.startCol, selection.endCol);
      const rowsArr: string[] = [];
      for (let r = sr; r <= er; r++) {
        const colsArr: string[] = [];
        for (let c = sc; c <= ec; c++) colsArr.push(String(data[r][columns[c].key] ?? ''));
        rowsArr.push(colsArr.join('\t'));
      }
      textToCopy = rowsArr.join('\n');
    } else {
      textToCopy = String(data[activeCell.row][columns[activeCell.col].key] ?? '');
    }
    navigator.clipboard.writeText(textToCopy);
  }, [activeCell, selection, data, columns]);

  const handlePaste = useCallback(async () => {
    if (!activeCell) return;
    try {
      const text = await navigator.clipboard.readText();
      const rows = text.split('\n').map(row => row.split('\t'));
      const newData = [...data];
      const startRow = activeCell.row, startCol = activeCell.col;
      rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          const tr = startRow + r, tc = startCol + c;
          if (tr < newData.length && tc < columns.length) newData[tr][columns[tc].key] = cell;
        });
      });
      setData(newData);
      if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  }, [activeCell, data, columns, setTabDirty, currentFile]);

  // ============== 导出/保存（原样保留） ==============
  const handleExport = useCallback(() => {
    const headers = columns.map(col => col.displayName);
    const rows = data.map(row => columns.map(col => String(row[col.key] ?? '')));
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => (cell.includes(',') || cell.includes('"') || cell.includes('\n') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${currentFile?.name || 'export'}.csv`; link.click();
    URL.revokeObjectURL(url);
  }, [data, columns, currentFile]);

  const handleSave = useCallback(async () => {
    if (!currentFile) return;
    try {
      const csvContent = [
        columns.map(col => col.displayName).join(','),
        ...data.map(row => columns.map(col => String(row[col.key] ?? '')).join(','))
      ].join('\n');
      await usePreviewStore.getState().updateActiveFileContent(csvContent);
      if (setTabDirty) setTabDirty(currentFile.id, false);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [currentFile, data, columns, setTabDirty]);

  if (!currentFile || (currentFile.type !== 'csv' && currentFile.type !== 'xlsx' && !typeOverride)) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <FileSpreadsheet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No spreadsheet file selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f3f3f3]">
      {/* Ribbon */}
      <div className="bg-white border-b border-gray-300 shadow-sm">
        <div className="px-2 py-1 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button onClick={handleSave} className="px-3 py-1.5 text-sm bg-theme-600 text-white rounded hover:bg-theme-700 flex items-center gap-1"><Save className="w-4 h-4" />Save</button>
            <button onClick={handleExport} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><Download className="w-4 h-4" />Export</button>
          </div>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-2 ml-auto">
            <Home className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">{currentFile.name}</span>
          </div>
        </div>
      </div>

      {/* Formula Bar */}
      {showFormulaBar && activeCell && (
        <div className="bg-white border-b border-gray-200 px-2 py-1 flex items-center gap-2">
          <div className="px-2 py-0.5 bg-gray-100 text-sm font-mono text-gray-700 rounded">
            {getCellAddress(activeCell.row, activeCell.col)}
          </div>
          <input
            type="text"
            value={editingCell ? editValue : String(data[activeCell.row]?.[columns[activeCell.col]?.key] ?? '')}
            onChange={(e) => { if (editingCell) setEditValue(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !editingCell) {
                setEditingCell(activeCell);
                setEditValue(String(data[activeCell.row][columns[activeCell.col].key] ?? ''));
              }
            }}
            className="flex-1 px-2 py-0.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-theme-500"
          />
        </div>
      )}

      {/* Grid */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white">
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-[#f0f0f0] border border-gray-300 w-12 h-8 text-center text-xs text-gray-600"/>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <th
                  key={header.id}
                  className="bg-[#f0f0f0] border border-gray-300 h-8 px-1 text-left relative"
                  style={{ width: header.getSize() }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
              <tr key={row.id}>
                {/* Row number */}
                <td className="sticky left-0 z-10 bg-[#f0f0f0] border border-gray-300 w-12 h-7 text-center text-xs text-gray-600">
                  {rowIndex + 1}
                </td>
                {/* Data cells with merge support */}
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id;
                  const colIndex = columns.findIndex(c => c.key === colId);
                  const dataKey = `${rowIndex}:${colIndex}`;

                  if (coveredSet.has(dataKey)) return null;

                  const span = spanMap[dataKey];

                  // 从 styleMap 读取工作表样式（sheet 坐标 = 数据行 + headerOffset）
                  const sheetKey = `${rowIndex + headerOffset}:${colIndex}`;
                  const xlsCss = styleMap[sheetKey] || {};

                  // 拆分成"单元格级样式（背景/对齐）"与"文本级样式（粗斜体/颜色）"
                  const cellStyle: React.CSSProperties = {};
                  const textStyle: React.CSSProperties = {};

                  // 背景色 -> <td>
                  if (xlsCss.backgroundColor) cellStyle.backgroundColor = xlsCss.backgroundColor;
                  // 水平对齐 -> <td>
                  if (xlsCss.textAlign) cellStyle.textAlign = xlsCss.textAlign as any;
                  // 垂直对齐：Excel 的 center 映射为 HTML 的 middle
                  if (xlsCss.verticalAlign) {
                    const v = String(xlsCss.verticalAlign).toLowerCase();
                    cellStyle.verticalAlign = (v === 'center' ? 'middle' : v) as any;
                  } else {
                    cellStyle.verticalAlign = 'middle';
                  }

                  // 文本样式 -> 内层 <div>/<span>
                  if (xlsCss.fontWeight) textStyle.fontWeight = xlsCss.fontWeight;
                  if (xlsCss.fontStyle)  textStyle.fontStyle  = xlsCss.fontStyle;
                  if (xlsCss.color)      textStyle.color      = xlsCss.color;

                  // 数字默认右对齐（若未指定）
                  if (columns[colIndex]?.type === 'number' && !cellStyle.textAlign) {
                    cellStyle.textAlign = 'right';
                  }

                  // 提取对齐信息用于 flex 布局
                  const horiz = (xlsCss as any).__horiz as string | undefined;
                  const vert  = (xlsCss as any).__vert  as string | undefined;

                  const justifyContent =
                    horiz === 'center' ? 'center' :
                    horiz === 'right'  ? 'flex-end' : 
                    // 数字列默认右对齐
                    columns[colIndex]?.type === 'number' && !horiz ? 'flex-end' : 'flex-start';

                  const alignItems =
                    vert === 'center' ? 'center' :
                    vert === 'bottom' ? 'flex-end' : 'flex-start';

                  const isActive = !!(activeCell && activeCell.row === rowIndex && activeCell.col === colIndex);
                  const inSelection = !!(selection &&
                    rowIndex >= Math.min(selection.startRow, selection.endRow) &&
                    rowIndex <= Math.max(selection.startRow, selection.endRow) &&
                    colIndex >= Math.min(selection.startCol, selection.endCol) &&
                    colIndex <= Math.max(selection.startCol, selection.endCol));

                  // 若单元格有背景色，则选区不再加蓝底，只加描边；否则才用蓝底
                  const selectionBgClass = inSelection && !isActive && !cellStyle.backgroundColor ? 'bg-theme-50' : '';

                  return (
                    <td
                      key={cell.id}
                      className={`border border-gray-300 p-0 align-middle ${selectionBgClass} ${isActive ? 'ring-2 ring-theme-500 ring-inset' : ''}`}
                      style={{ width: cell.column.getSize(), ...cellStyle }}
                      rowSpan={span?.rowSpan}
                      colSpan={span?.colSpan}
                      onClick={() => { setActiveCell({ row: rowIndex, col: colIndex }); setSelection(null); }}
                      onDoubleClick={() => {
                        setActiveCell({ row: rowIndex, col: colIndex });
                        setEditingCell({ row: rowIndex, col: colIndex });
                        setEditValue(String(data[rowIndex][columns[colIndex].key] ?? ''));
                      }}
                      onContextMenu={(e) => { e.preventDefault(); setActiveCell({ row: rowIndex, col: colIndex }); setContextMenu({ x: e.clientX, y: e.clientY }); }}
                    >
                      <div 
                        className="relative h-full min-h-[28px] flex px-2 text-sm" 
                        style={{
                          ...textStyle,
                          justifyContent,
                          alignItems,
                          width: '100%'
                        }}
                      >
                        {editingCell && editingCell.row === rowIndex && editingCell.col === colIndex ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              const newData = [...data];
                              newData[rowIndex][columns[colIndex].key] = editValue;
                              setData(newData);
                              setEditingCell(null);
                              if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                              else if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="absolute inset-0 w-full h-full px-2 border-2 border-theme-500 focus:outline-none"
                            style={{ textAlign: cellStyle.textAlign || 'left' }}
                            autoFocus
                          />
                        ) : (
                          <span className="truncate" style={{ width: '100%' }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status Bar */}
      <div className="bg-[#f0f0f0] border-t border-gray-300 px-3 py-1 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <span>Ready</span>
          {selection && (
            <span>
              {Math.abs(selection.endRow - selection.startRow) + 1} × {Math.abs(selection.endCol - selection.startCol) + 1} cells selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{data.length} rows</span>
          <span>{columns.length} columns</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={() => { handleCopy(); setContextMenu(null); }}
          onPaste={() => { handlePaste(); setContextMenu(null); }}
          onDelete={() => {
            if (activeCell) {
              const newData = [...data];
              newData[activeCell.row][columns[activeCell.col].key] = '';
              setData(newData);
              if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
            }
            setContextMenu(null);
          }}
          onInsertRowAbove={() => {
            if (activeCell) {
              const newData = [...data];
              const newRow: CSVRow = {};
              columns.forEach(col => { newRow[col.key] = ''; });
              newData.splice(activeCell.row, 0, newRow);
              setData(newData);
              if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
            }
            setContextMenu(null);
          }}
          onInsertRowBelow={() => {
            if (activeCell) {
              const newData = [...data];
              const newRow: CSVRow = {};
              columns.forEach(col => { newRow[col.key] = ''; });
              newData.splice(activeCell.row + 1, 0, newRow);
              setData(newData);
              if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
            }
            setContextMenu(null);
          }}
          onDeleteRow={() => {
            if (activeCell && data.length > 1) {
              const newData = [...data];
              newData.splice(activeCell.row, 1);
              setData(newData);
              if (setTabDirty && currentFile) setTabDirty(currentFile.id, true);
            }
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
};

export default DataTable;