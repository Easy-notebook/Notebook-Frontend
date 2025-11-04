/* eslint-disable no-console */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Trash2, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import useStore, { Cell as StoreCell, OutputItem, CellType } from '../../../store/notebookStore';
import { v4 as uuidv4 } from 'uuid';
import mermaid from 'mermaid';
import editorLogger from '../../../utils/logger/editor_logger';

interface MarkdownCellProps {
  cell: StoreCell;
  disableDefaultTitleStyle?: boolean;
}

interface MermaidDiagramProps {
  chart: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as HTMLDivElement).innerHTML = chart;
      mermaid.initialize({ startOnLoad: true });
      mermaid.init(undefined, containerRef.current);
    }
  }, [chart]);
  return <div ref={containerRef} className="mermaid" />;
};

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!inline && match) {
    const lang = match[1];
    if (lang === 'mermaid') {
      return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
    }
    return (
      <pre {...props} className={className}>
        <code>{children}</code>
      </pre>
    );
  } else {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

interface MarkdownImageProps {
  alt?: string;
  src?: string;
  title?: string;
}

const MarkdownImage: React.FC<MarkdownImageProps> = ({ alt, src, title }) => (
  <div style={{ textAlign: 'center' }}>
    <img
      src={src}
      alt={alt}
      title={title}
      style={{ maxWidth: '100%', height: 'auto', display: 'inline-block' }}
    />
  </div>
);

interface MarkdownTableProps {
  children: React.ReactNode;
  [key: string]: any;
}
const MarkdownTable: React.FC<MarkdownTableProps> = ({ children, ...props }) => (
  <div className="table-container" style={{ overflowX: 'auto', margin: '1rem 0' }}>
    <table
      {...props}
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        minWidth: '300px',
      }}
    >
      {children}
    </table>
  </div>
);

interface MarkdownTableRowProps {
  children: React.ReactNode;
  [key: string]: any;
}
const MarkdownTableRow: React.FC<MarkdownTableRowProps> = ({ children, ...props }) => (
  <tr {...props}>{children}</tr>
);

interface MarkdownTableCellProps {
  children: React.ReactNode;
  [key: string]: any;
}
const MarkdownTableCell: React.FC<MarkdownTableCellProps> = ({ children, ...props }) => (
  <td
    {...props}
    style={{
      padding: '8px 12px',
      border: '1px solid #e2e8f0',
      ...props.style,
    }}
  >
    {children}
  </td>
);

interface MarkdownTableHeadProps {
  children: React.ReactNode;
  [key: string]: any;
}
const MarkdownTableHead: React.FC<MarkdownTableHeadProps> = ({ children, ...props }) => (
  <th
    {...props}
    style={{
      padding: '12px',
      border: '1px solid #e2e8f0',
      backgroundColor: '#f8fafc',
      fontWeight: 600,
      ...props.style,
    }}
  >
    {children}
  </th>
);

// Markdown 高亮
const markdownHighlighting = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700', color: '#41B883' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#41B883' },
  { tag: tags.link, color: '#41B883', textDecoration: 'none', borderBottom: '1.5px solid #41B883' },
  {
    tag: tags.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.875rem',
    backgroundColor: 'rgba(65, 184, 131, 0.05)',
    color: '#41B883',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    fontWeight: '500',
  },
  {
    tag: tags.quote,
    borderLeft: '4px solid #41B883',
    backgroundColor: 'rgba(65, 184, 131, 0.05)',
    color: '#35495E',
    fontStyle: 'italic',
    padding: '0.5rem 1rem',
    margin: '1.5rem 0',
  },
  { tag: tags.list, color: '#41B883', fontWeight: 'bold' },
]);

const MarkdownCell: React.FC<MarkdownCellProps> = ({ cell, disableDefaultTitleStyle = false }) => {
  const {
    addCell,
    cells,
    updateCell,
    deleteCell,
    setCurrentCell,
    editingCellId,
    setEditingCellId,
    showButtons,
    setShowButtons,
    viewMode,
  } = useStore();

  // 重要：EditorView 实例（不要再用 .view）
  const editorRef = useRef<EditorView | null>(null);
  const isEditing = editingCellId === cell.id;
  const hasContent = cell.content.trim().length > 0;
  const cellShowButtons = showButtons[cell.id] || false;
  const isDefaultTitle = cell.metadata?.isDefaultTitle === true && !disableDefaultTitleStyle;

  /** ---------- Markdown 渲染组件 ---------- **/
  const markdownComponents = useMemo(
    () =>
      ({
        code: CodeBlock,
        img: MarkdownImage,
        table: MarkdownTable,
        tr: MarkdownTableRow,
        td: MarkdownTableCell,
        th: MarkdownTableHead,
        p: ({ children, ...props }: any) => {
          if (typeof children === 'string') {
            const processedChildren = children.split('\n').reduce((acc: any[], part: string, index: number) => {
              if (index > 0) acc.push(<br key={`br-${index}`} />);
              acc.push(part);
              return acc;
            }, []);
            return <p {...props}>{processedChildren}</p>;
          }
          return <p {...props}>{children}</p>;
        },
        a: ({ href = '', children, ...props }: any) => (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              if (!href) return;
              e.preventDefault();
              import('../../../store/previewStore').then(async (mod) => {
                const usePreviewStore = (mod as any).default;
                const useNotebookStore = (await import('../../../store/notebookStore')).default as any;
                const notebookId = useNotebookStore.getState().notebookId;
                if (!notebookId) return;
                const { Backend_BASE_URL } = await import('../../../config/base_url');

                const base = (Backend_BASE_URL as any)?.replace(/\/$/, '');
                let filePath: string | null = null;
                try {
                  const pattern = new RegExp(`^${base}/download_file/${notebookId}/(.+)$`);
                  const m = href.match(pattern);
                  if (m && m[1]) filePath = decodeURIComponent(m[1]);
                } catch {}
                if (!filePath) {
                  const relPattern = new RegExp('^(\\.|\\.\\.|[^:/?#]+$|\\.\\/\\.assets\\/|\\.assets\\/)');
                  if (relPattern.test(href)) {
                    filePath = href.replace(new RegExp('^\\./'), '');
                  } else if (!new RegExp('^[a-z]+://', 'i').test(href) && href.indexOf('/') === -1) {
                    filePath = href;
                  }
                }

                if (!filePath) {
                  window.open(href, '_blank', 'noopener,noreferrer');
                  return;
                }

                try {
                  const fileObj = { name: filePath.split('/').pop() || filePath, path: filePath, type: 'file' } as any;
                  await usePreviewStore.getState().previewFile(notebookId, filePath, { file: fileObj } as any);
                  if (usePreviewStore.getState().previewMode !== 'file') {
                    usePreviewStore.getState().changePreviewMode();
                  }
                } catch (err: any) {
                  console.error('Markdown link split preview failed:', err);
                  try {
                    const baseName = (filePath || href).split('/').pop() || '';
                    if (baseName && baseName !== filePath) {
                      const fileObj2 = { name: baseName, path: baseName, type: 'file' } as any;
                      await usePreviewStore.getState().previewFile(notebookId, baseName, { file: fileObj2 } as any);
                      if (usePreviewStore.getState().previewMode !== 'file') {
                        usePreviewStore.getState().changePreviewMode();
                      }
                      return;
                    }
                  } catch (e) {
                    console.error('Fallback to root failed:', e);
                  }
                }
              });
            }}
          >
            {children}
          </a>
        ),
      }) as any,
    [],
  );

  /** ---------- 新建 cell ---------- **/
  const isEmptyMarkdownCell = useCallback((content: string) => content.trim() === '', []);

  const createNewMarkdownCell = useCallback(
    (afterIndex: number) => {
      const newCellId = uuidv4();
      const newCell: Partial<StoreCell> = {
        id: newCellId,
        type: 'markdown' as CellType,
        content: '',
        outputs: [] as OutputItem[],
        enableEdit: true,
      };
      addCell(newCell, afterIndex + 1);
      // 交给目标 cell 的组件在挂载时 autoFocus
      setEditingCellId(newCellId);
      return newCellId;
    },
    [addCell, setEditingCellId],
  );

  const createNewCodeCell = useCallback(
    (content: string, afterIndex: number, codeIdentifier?: string) => {
      const newCellId = uuidv4();
      const newCell: Partial<StoreCell> = {
        id: newCellId,
        type: 'code' as CellType,
        content: content.trim(),
        outputs: [] as OutputItem[],
        enableEdit: true,
        metadata: { ...(cell.metadata || {}), language: codeIdentifier || 'python' },
      };
      addCell(newCell, afterIndex + 1);
      setCurrentCell(newCellId);
      setEditingCellId(null);
      // 若当前编辑器存在，滚动到底（避免访问 view.view…）
      if (editorRef.current) {
        const view = editorRef.current;
        view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
      }
      return newCellId;
    },
    [addCell, setEditingCellId, setCurrentCell, cell.metadata],
  );

  /** ---------- 内容变更（含 ``` 代码块拆分 / 标题后自动新建 cell） ---------- **/
  const handleChange = useCallback(
    (value: string) => {
      const currentIndex = cells.findIndex((c) => c.id === cell.id);
      const lines = value.split('\n');

      // ```lang 代码块拆分
      for (let i = lines.length - 1; i >= 0; i--) {
        const currentLine = lines[i];
        if (currentLine.startsWith('```') && currentLine.length > 3 && i < lines.length - 1) {
          const beforeBackticks = lines.slice(0, i).join('\n');
          const codeIdentifier = currentLine.slice(3).trim();
          const codeContent = lines.slice(i + 1).join('\n');

          if (isEmptyMarkdownCell(beforeBackticks)) {
            createNewCodeCell(codeContent, currentIndex, codeIdentifier);
            deleteCell(cell.id);
          } else {
            updateCell(cell.id, beforeBackticks.trim());
            createNewCodeCell(codeContent, currentIndex, codeIdentifier);
          }
          return;
        }
      }

      // 标题行 + 空行后自动新建一个 markdown cell
      if (
        lines.length >= 2 &&
        /^#{1,6}\s+.+/.test(lines[lines.length - 2]) &&
        lines[lines.length - 1].trim() === ''
      ) {
        updateCell(cell.id, value);
        createNewMarkdownCell(currentIndex);
        return;
      }

      updateCell(cell.id, value);
    },
    [cell.id, cells, updateCell, createNewCodeCell, createNewMarkdownCell, deleteCell, isEmptyMarkdownCell],
  );

  /** ---------- 跨 cell 导航（供 keymap/按键共用） ---------- **/
  const navigateToSibling = useCallback(
    (direction: 'up' | 'down') => {
      const currentIndex = cells.findIndex((c) => c.id === cell.id);
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      editorLogger.logNavigationAttempt(cell.id, cell.type, direction, {
        fromIndex: currentIndex,
        toIndex: newIndex,
        total: cells.length,
      } as any);

      if (newIndex >= 0 && newIndex < cells.length) {
        const targetCell = cells[newIndex];
        editorLogger.logNavigationSuccess(cell.id, targetCell.id, cell.type, targetCell.type, direction);

        if (targetCell.type === 'markdown') {
          // 切到目标 markdown，目标组件会 autoFocus
          setCurrentCell(targetCell.id);
          setEditingCellId(targetCell.id);
        } else {
          // 其它类型（code/thinking/image 等）
          setEditingCellId(null);
          setCurrentCell(targetCell.id);
          
          // 对于 code cell，确保聚焦到编辑器并传递导航方向
          if (targetCell.type === 'code') {
            // 发送导航事件以正确定位光标
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('cell-navigation', {
                detail: { targetCellId: targetCell.id, direction }
              }));
            }, 0);
            
            setTimeout(() => {
              const codeElement = document.querySelector(`[data-cell-id="${targetCell.id}"] .cm-editor .cm-content`);
              if (codeElement) {
                (codeElement as HTMLElement).focus();
              }
            }, 150); // 给足时间让 CodeCell 的 useEffect 执行
          }
        }
      } else {
        editorLogger.logNavigationBlocked(cell.id, cell.type, direction, 'no_target_cell_available');
      }
    },
    [cells, cell.id, cell.type, setCurrentCell, setEditingCellId],
  );

  /** ---------- 用 keymap 精准拦截方向键（编辑模式） ---------- **/
  const boundaryKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: 'ArrowDown',
          run: (view) => {
            // 最后一行且行尾 -> 下一个 cell
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const line = view.state.doc.lineAt(sel.head);
            if (line.number === view.state.doc.lines && sel.head === line.to) {
              navigateToSibling('down');
              return true;
            }
            return false;
          },
        },
        {
          key: 'ArrowUp',
          run: (view) => {
            // 第一行且行首 -> 上一个 cell
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const line = view.state.doc.lineAt(sel.head);
            if (line.number === 1 && sel.head === line.from) {
              navigateToSibling('up');
              return true;
            }
            return false;
          },
        },
        {
          key: 'ArrowRight',
          run: (view) => {
            // 文档末尾或最后一行末尾 -> 下一个 cell（你要的“末尾按右键”）
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const atDocEnd = sel.head === view.state.doc.length;
            const line = view.state.doc.lineAt(sel.head);
            const atLastLineEnd = line.number === view.state.doc.lines && sel.head === line.to;
            if (atDocEnd || atLastLineEnd) {
              navigateToSibling('down');
              return true;
            }
            return false;
          },
        },
        {
          key: 'ArrowLeft',
          run: (view) => {
            // 文档开头或第一行行首 -> 上一个 cell
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const atDocStart = sel.head === 0;
            const line = view.state.doc.lineAt(sel.head);
            const atFirstLineStart = line.number === 1 && sel.head === line.from;
            if (atDocStart || atFirstLineStart) {
              navigateToSibling('up');
              return true;
            }
            return false;
          },
        },
      ]),
    [navigateToSibling],
  );

  /** ---------- 编辑/聚焦日志 ---------- **/
  useEffect(() => {
    editorLogger.logEditModeChange(cell.id, cell.type, isEditing);
    if (isEditing && editorRef.current) {
      editorRef.current.focus();
      editorLogger.logFocusChange(cell.id, cell.type, true);
    }
  }, [isEditing, cell.id, cell.type]);

  /** ---------- Editor 创建回调：保存 EditorView 实例 ---------- **/
  const handleCreateEditor = useCallback((view: EditorView, _state: EditorState) => {
    editorRef.current = view;

    // 调试信息
    setTimeout(() => {
      const v = editorRef.current;
      if (v) {
        console.log('Editor ready:', {
          lines: v.state.doc.lines,
          length: v.state.doc.length,
          selection: v.state.selection.main,
        });
      }
    }, 50);
  }, []);

  /** ---------- 其它快捷键：保留原逻辑（React 层） ---------- **/
  const toggleEditing = useCallback(() => {
    if (!isEditing) setEditingCellId(cell.id);
    else setEditingCellId(null);
  }, [isEditing, cell.id, setEditingCellId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const currentIndex = cells.findIndex((c) => c.id === cell.id);

      if (event.ctrlKey && event.key === 'Enter') {
        toggleEditing();
        return;
      }

      if (event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        createNewMarkdownCell(currentIndex);
        return;
      }

      // Alt + Up/Down：无条件跨 cell（与 keymap 不冲突）
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        navigateToSibling(event.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }

      // 非编辑模式时，允许用上下键在 cell 之间移动
      if (!isEditing && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        navigateToSibling(event.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }

      // 编辑模式下的左右键跨 cell 已由 keymap 处理，这里不再重复
    },
    [cells, cell.id, isEditing, toggleEditing, createNewMarkdownCell, navigateToSibling],
  );

  const handleBlur = useCallback(() => {
    if (isEditing) setEditingCellId(null);
  }, [isEditing, setEditingCellId]);

  return (
    <>
      <style>
        {`
          .katex, .katex-display { font-size: 1.5em !important; user-select: all !important; }
          .katex-display { text-align: center; }
        `}
      </style>
      <div className="relative group" data-cell-id={cell.id}>
        <div className={`markdown-cell ${!hasContent && !isEditing ? 'min-h-[20px]' : ''}`}>
          <div
            className="flex items-start relative"
            onMouseEnter={() => setShowButtons(cell.id, true)}
            onMouseLeave={() => setShowButtons(cell.id, false)}
          >
            <div className="flex-grow prose w-full pb-0 mb-0 selection:bg-theme-200">
              {isEditing ? (
                <CodeMirror
                  onCreateEditor={handleCreateEditor}
                  value={cell.content}
                  height="auto"
                  extensions={[
                    markdown(),
                    EditorView.lineWrapping,
                    syntaxHighlighting(markdownHighlighting),
                    boundaryKeymap, // ★ 拦截方向键做跨 cell
                  ]}
                  onChange={handleChange}
                  className="markdown-editor-codemirror"
                  theme={EditorView.theme({
                    '&': {
                      border: 'none !important',
                      boxShadow: 'none !important',
                      backgroundColor: 'transparent !important',
                      padding: 0,
                      fontSize: '1rem',
                      lineHeight: '1.6',
                    },
                    '.cm-scroller': {
                      backgroundColor: 'transparent !important',
                      padding: 0,
                    },
                    '.cm-content': {
                      padding: 0,
                      minHeight: 'auto',
                    },
                    '.cm-focused': {
                      outline: 'none !important',
                    },
                    '.cm-editor': {
                      fontSize: '1rem !important',
                      lineHeight: '1.6 !important',
                    },
                  })}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  autoFocus
                />
              ) : (
                <div
                  className={`text-lg leading-relaxed markdown-cell min-h-[25px] pb-0 mb-0 selection:bg-theme-200 ${
                    isDefaultTitle ? 'default-title-markdown' : ''
                  } focus:outline-none focus:ring-2 focus:ring-theme-300 focus:ring-opacity-50`}
                  onDoubleClick={toggleEditing}
                  onClick={(event) => {
                    if (!isEditing) {
                      (event.target as HTMLElement)?.focus();
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  tabIndex={0}
                  role="button"
                  style={
                    isDefaultTitle
                      ? {
                          color: '#9ca3af',
                          borderLeft: '4px solid #e5e7eb',
                          paddingLeft: '1rem',
                          marginBottom: '1.5rem',
                        }
                      : {}
                  }
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                    {cell.content.replace(/(?<!\n)\n(?!\n)/g, '  \n')}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {(viewMode === 'create' || viewMode === 'step') && (
              <div
                className={`absolute -right-14 top-1 flex items-center transition-opacity duration-200 ${
                  cellShowButtons || isEditing ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEditing();
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded"
                  >
                    <Eye size={14} />
                  </button>
                )}
                {deleteCell && !isDefaultTitle && cell.content !== '# Untitled' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCell(cell.id);
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(MarkdownCell);
