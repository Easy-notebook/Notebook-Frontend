import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect,
  useCallback,
  MutableRefObject,
} from 'react';
import useStore from '@Store/notebookStore';
import CodeCell from './Cells/CodeCell';
import HybridCell from './Cells/HybridCell';
import MarkdownCell from './Cells/MarkdownCell';
import ImageCell from './Cells/ImageCell';
import AIThinkingCell from './Cells/AIThinkingCell';
import LinkCell from './Cells/LinkCell';
import DraggableCellList from './DragAndDrop/DraggableCellList';
import ShortcutsHelp from './KeyboardShortcuts/ShortcutsHelp';
import { handleFileUpload } from '@Utils/fileUtils';
import { notebookApiIntegration } from '@Services/notebookServices';
import { Backend_BASE_URL } from '@Config/base_url';
import {
  focusNotebookAtEnd,
  isBlankArea,
  focusCellEditor,
  debouncedFocus,
} from './utils/cursorPositioning';

/* --------------------------- Types --------------------------- */
import { Cell, CellType, OutputItem } from '@Store/notebookStore';

interface ThinkingCellExtra {
  agentName?: string;
  customText?: string;
  textArray?: string[];
  useWorkflowThinking?: boolean;
  language?: string;
}

interface JupyterNotebookEditorProps {
  className?: string;
  readOnly?: boolean;
}

export interface JupyterNotebookEditorHandle {
  editor: null;
  focus: () => void;
  getHTML: () => string;
  setContent: (html: string) => void;
  clearContent: () => void;
  isEmpty: () => boolean;
  getCells: () => Cell[];
  setCells: (newCells: Cell[]) => void;
  addCodeCell: () => string;
  addMarkdownCell: () => string;
  addHybridCell: () => string;
  addAIThinkingCell: (props?: ThinkingCellExtra) => string;
}

/* ------------------------- Component ------------------------- */
const JupyterNotebookEditor = forwardRef < JupyterNotebookEditorHandle, JupyterNotebookEditorProps> (
  ({ className = '', readOnly = false }, ref) => {
    const { cells, setCells, notebookId } = useStore();

    const containerRef = useRef < HTMLDivElement | null > (null);
    const [focusedCellId, setFocusedCellId] = useState < string | null > (null);
    const [isDragEnabled] = useState < boolean > (true);
    const [showShortcutsHelp, setShowShortcutsHelp] = useState < boolean > (false);

    // Upload state (values unused; setters passed to uploader)
    const [, setUploading] = useState < boolean > (false);
    const [, setUploadProgress] = useState < number > (0);
    const [, setUploadError] = useState < string | null > (null);
    const abortControllerRef = useRef < AbortController | null > (null);
    const fileInputRef = useRef < HTMLInputElement | null > (null);

    useEffect(() => {
      // eslint-disable-next-line no-console
      console.log('[JupyterNotebookEditor] cells:', cells.length, cells.map((c) => c.type));
    }, [cells]);

    /* ------------------------- Type helpers ------------------------- */
    type RendererOutput = { type: 'error' | 'image' | 'text' | 'html'; content: any; key?: string; timestamp?: string };
    const normalizeOutputsForRenderer = useCallback((outs?: OutputItem[] | any[]): RendererOutput[] => {
      const arr = Array.isArray(outs) ? outs : [];
      return arr.map((o: any): RendererOutput => {
        const t = o?.type;
        const normalizedType: RendererOutput['type'] = t === 'error' || t === 'image' || t === 'html' ? t : 'text';
        return { type: normalizedType, content: o?.content, key: o?.key, timestamp: o?.timestamp };
      });
    }, []);

    const ensureHTMLElement = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement;

    const isCellType = (val: unknown): val is CellType =>
      typeof val === 'string' && ['code', 'markdown', 'raw', 'hybrid', 'image', 'thinking', 'link'].includes(val);

    const generateCellId = useCallback((): string => {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `cell-${crypto.randomUUID()}`;
      }
      return `cell-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }, []);

    const setCellContent = useCallback(
      (cellId: string, content: string, extra?: Partial<Cell>) => {
        const newCells = cells.map((c) => (c.id === cellId ? { ...c, content, ...(extra ?? {}) } : c));
        setCells(newCells);
      },
      [setCells, cells],
    );

    const handleCellsReorder = useCallback((newCells: unknown[]) => {
      setCells(newCells as Cell[]);
    }, [setCells]);

    const handleAddCell = useCallback(
      (type: CellType, index = -1): string => {
        const id = generateCellId();
        const isHybrid = type === 'hybrid';

        const newCell: Cell = {
          id,
          type,
          content: '',
          outputs: [],
          enableEdit: type !== 'thinking',
          ...(type === 'thinking'
            ? {
              metadata: {
                agentName: 'AI',
                customText: undefined,
                textArray: [],
                useWorkflowThinking: false,
                language: undefined,
              }
            }
            : {
              metadata: {
                language: type === 'code' || isHybrid ? 'python' : undefined,
              }
            }),
        };

        const pos = index < 0 ? cells.length : Math.min(index, cells.length);
        const next = [...cells];
        next.splice(pos, 0, newCell);
        setCells(next);

        // 稳定聚焦：一帧后再 setTimeout
        requestAnimationFrame(() => {
          window.setTimeout(() => {
            setFocusedCellId(id);
            const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
            if (el) focusCellEditor(el, true);
          }, 50);
        });

        return id;
      },
      [generateCellId, setCells],
    );

    // Adapter for DnD list onAddCell signature
    const handleAddCellForDnD = useCallback((type: string, afterIndex: number) => {
      const t = isCellType(type) ? type : 'markdown';
      handleAddCell(t, afterIndex);
    }, [handleAddCell]);

    const handleDeleteCell = useCallback((cellId: string) => {
      const newCells = cells.filter((cell) => cell.id !== cellId);
      setCells(newCells);
    }, [setCells, cells]);

    const handleMoveCell = useCallback((cellId: string, direction: 'up' | 'down') => {
      const idx = cells.findIndex((c) => c.id === cellId);
      if (idx === -1) return;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= cells.length) return;
      const next = [...cells];
      [next[idx], next[target]] = [next[target], next[idx]];
      setCells(next);
    }, [setCells]);

    const renderCell = useCallback(
      (cell: Cell) => {
        const cellIndex = cells.findIndex((c) => c.id === cell.id);
        const commonProps = {
          cell,
          readOnly,
          onDelete: () => handleDeleteCell(cell.id),
          onMoveUp: cellIndex > 0 ? () => handleMoveCell(cell.id, 'up') : undefined,
          onMoveDown: cellIndex < cells.length - 1 ? () => handleMoveCell(cell.id, 'down') : undefined,
          focused: focusedCellId === cell.id,
          onFocus: () => setFocusedCellId(cell.id),
          onBlur: () => setFocusedCellId(null),
        };

        const cellWithExtendedProps = {
          ...cell,
          // 为thinking类型的cell添加扩展属性
          ...(cell.type === 'thinking' && cell.metadata ? {
            agentName: cell.metadata.agentName,
            customText: cell.metadata.customText,
            textArray: cell.metadata.textArray,
            useWorkflowThinking: cell.metadata.useWorkflowThinking,
          } : {}),
          // Ensure outputs exist for components that expect an array
          outputs: Array.isArray(cell.outputs) ? cell.outputs : [],
        };

        switch (cell.type) {
          case 'code':
            return (
              <CodeCell
                key={cell.id}
                {...(commonProps as any)}
                cell={{
                  id: cell.id,
                  content: cell.content,
                  description: cell.description ?? undefined,
                  outputs: normalizeOutputsForRenderer(cell.outputs),
                } as any}
              />
            );
          case 'hybrid':
            return (
              <HybridCell
                key={cell.id}
                {...(commonProps as any)}
                cell={{ ...cellWithExtendedProps, outputs: normalizeOutputsForRenderer(cell.outputs) } as any}
              />
            );
          case 'markdown':
            return (
              <MarkdownCell
                key={cell.id}
                {...(commonProps as any)}
                cell={cellWithExtendedProps as any}
                disableDefaultTitleStyle
              />
            );
          case 'image':
            return (
              <ImageCell
                key={cell.id}
                {...(commonProps as any)}
                cell={cellWithExtendedProps as any}
              />
            );
          case 'thinking':
            return <AIThinkingCell key={cell.id} {...(commonProps as any)} cell={cellWithExtendedProps as any} />;
          case 'link':
            return <LinkCell key={cell.id} {...(commonProps as any)} cell={cellWithExtendedProps as any} />;
          default:
            return (
              <div key={cell.id} className="p-4 border border-red-200 rounded-lg bg-red-50 text-red-700">
                Unknown cell type: {String(cell.type)}
              </div>
            );
        }
      },
      [cells, focusedCellId, handleDeleteCell, handleMoveCell, readOnly],
    );

    // CellDivider removed (unused)

    /* --------------------------- HTML I/O --------------------------- */
    const convertCellsToHTML = useCallback((): string => {
      return cells.map((cell) => {
        switch (cell.type) {
          case 'markdown':
            return `<div class="markdown-cell">${cell.content ?? ''}</div>`;
          case 'code':
          case 'hybrid':
            return `<div class="code-cell" data-language="${cell.metadata?.language || 'python'}">${cell.content ?? ''}</div>`;
          case 'thinking':
            return `<div class="thinking-cell" data-agent="${cell.metadata?.agentName ?? 'AI'}">${cell.metadata?.customText ?? ''}</div>`;
          case 'image':
          case 'link':
            return `<div class="${cell.type}-cell">${cell.content ?? ''}</div>`;
          default:
            return `<div class="unknown-cell">${cell.content ?? ''}</div>`;
        }
      }).join('\n');
    }, [cells]);

    const setContentFromHTML = useCallback((html: string) => {
      // 可按需实现
      // eslint-disable-next-line no-console
      console.log('Setting content from HTML:', html);
    }, []);

    /* ---------------------- Imperative handle ---------------------- */
    useImperativeHandle(ref, (): JupyterNotebookEditorHandle => ({
      editor: null,
      focus: () => {
        if (cells.length === 0) {
          const id = handleAddCell('markdown', 0);
          requestAnimationFrame(() => {
            setTimeout(() => {
              setFocusedCellId(id);
              const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
              if (el) focusCellEditor(el, true);
            }, 50);
          });
          return;
        }
        const last = cells[cells.length - 1];
        if (last.type === 'markdown') {
          debouncedFocus(() => {
            const containerEl = containerRef.current;
            if (containerEl && focusNotebookAtEnd(containerEl)) {
              const nodes = containerRef.current?.querySelectorAll('[data-cell-id]');
              const lastEl = nodes && nodes[nodes.length - 1];
              const cellId = lastEl?.getAttribute?.('data-cell-id');
              if (cellId) setFocusedCellId(cellId);
            }
          });
        } else {
          const id = handleAddCell('markdown', cells.length);
          requestAnimationFrame(() => {
            setTimeout(() => {
              setFocusedCellId(id);
              const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
              if (el) focusCellEditor(el, true);
            }, 50);
          });
        }
      },
      getHTML: convertCellsToHTML,
      setContent: setContentFromHTML,
      clearContent: () => setCells([]),
      isEmpty: () => cells.length === 0,
      getCells: () => cells,
      setCells: (newCells: Cell[]) => setCells(newCells),
      addCodeCell: () => handleAddCell('code', -1),
      addMarkdownCell: () => handleAddCell('markdown', -1),
      addHybridCell: () => handleAddCell('hybrid', -1),
      addAIThinkingCell: (props: ThinkingCellExtra = {}) => {
        const id = generateCellId();
        const newCell: Cell = {
          id,
          type: 'thinking',
          content: '',
          outputs: [],
          enableEdit: false,
          metadata: {
            agentName: props.agentName ?? 'AI',
            customText: props.customText ?? undefined,
            textArray: props.textArray ?? [],
            useWorkflowThinking: props.useWorkflowThinking ?? false,
            language: props.language,
          },
        };
        setCells([...cells, newCell]);
        return id;
      },
    }), [cells, convertCellsToHTML, generateCellId, handleAddCell, setCells, setContentFromHTML]);

    /* ------------------------ Click-to-focus ------------------------ */
    const handleEditorClick: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
      const target = e.target as Element | null;
      if (!ensureHTMLElement(target) || !isBlankArea(target)) return;

      if (cells.length === 0) {
        const id = handleAddCell('markdown', 0);
        requestAnimationFrame(() => {
          setTimeout(() => {
            setFocusedCellId(id);
            const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
            if (el) focusCellEditor(el, true);
          }, 50);
        });
        return;
      }

      const last = cells[cells.length - 1];
      if (last.type === 'markdown') {
        debouncedFocus(() => {
          const containerEl = containerRef.current;
          if (containerEl && focusNotebookAtEnd(containerEl)) {
            const nodes = containerRef.current?.querySelectorAll('[data-cell-id]');
            const lastEl = nodes && nodes[nodes.length - 1];
            const cellId = lastEl?.getAttribute?.('data-cell-id');
            if (cellId) setFocusedCellId(cellId);
          }
        });
      } else {
        const id = handleAddCell('markdown', -1);
        requestAnimationFrame(() => {
          setTimeout(() => {
            setFocusedCellId(id);
            const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
            if (el) focusCellEditor(el, true);
          }, 50);
        });
      }
    }, [cells, handleAddCell]);

    /* ----------------------------- Drop ----------------------------- */
    const handleEditorDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (!notebookId) {
          // eslint-disable-next-line no-console
          console.warn('Notebook ID not set, cannot upload.');
          return;
        }
        const dt = e.dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return;

        const files = Array.from(dt.files);
        const uploadConfig = {
          mode: 'open' as const,
          maxFileSize: 50 * 1024 * 1024,
          allowedTypes: [] as string[],
          maxFiles: files.length,
          targetDir: '.assets',
        };

        // Adapter to satisfy fileUtils NotebookApiIntegration typing
        const filesApi = {
          listFiles: (id: string) => notebookApiIntegration.listFiles(id) as any,
          uploadFiles: (id: string, f: File[], cfg: any, _onProgress: (e: ProgressEvent) => void, signal: AbortSignal) =>
            notebookApiIntegration.uploadFiles(id, f, cfg, signal) as any,
          getFilePreviewUrl: async (id: string, filename: string) =>
            `${Backend_BASE_URL}/assets/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`,
          getFileContent: async (id: string, filename: string) => {
            const res = await notebookApiIntegration.getFile(id, filename);
            if ((res as any).status === 'ok' && (res as any).content) return (res as any).content as string;
            throw new Error((res as any).message || 'Failed to get file content');
          },
          downloadFile: async (id: string, filename: string) => { await notebookApiIntegration.downloadFile(id, filename); },
          deleteFile: async () => { throw new Error('deleteFile not implemented'); },
        } as const;

        await handleFileUpload({
          notebookId,
          files,
          notebookApiIntegration: filesApi as any,
          uploadConfig,
          setUploading,
          setUploadProgress,
          setError: setUploadError,
          fileInputRef: fileInputRef as MutableRefObject<HTMLInputElement | null>,
          setIsPreview: () => { },
          toast: ({ title, description }: { title: string; description?: string }) =>
            // eslint-disable-next-line no-console
            console.log(title, description),
          onUpdate: (_cellId: string, payload: { uploadedFiles?: string[] }) => {
            (payload.uploadedFiles ?? []).forEach((name) => {
              const lower = name.toLowerCase();
              const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some((ext) =>
                lower.endsWith(ext),
              );
              const relPath = `.assets/${name}`;
              const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;

              if (isImage) {
                const id = handleAddCell('image', -1);
                setCellContent(id, `![${name}](${url})`);
              } else {
                const id = handleAddCell('link', -1);
                setCellContent(id, `[${name}](${relPath})`);
              }
            });
          },
          cellId: '',
          abortControllerRef: abortControllerRef as MutableRefObject<AbortController | null>,
          fetchFileList: async () => {
            try { await notebookApiIntegration.listFiles(notebookId); } catch { /* noop */ }
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Editor drop upload failed:', err);
      }
    }, [notebookId, handleAddCell, setCellContent]);

    const lastIsMarkdown = cells[cells.length - 1]?.type === 'markdown';

    /* ----------------------------- Render ----------------------------- */
    return (
      <div
        ref={containerRef}
        className={`jupyter-notebook-editor ${className} w-full h-full bg-transparent flex flex-col`}
        style={{ minHeight: '500px' }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleEditorDrop}
        onClick={handleEditorClick}
      >
        <div className="flex-1 w-full max-w-screen-lg mx-auto px-8 lg:px-16 flex flex-col">
          <div className="h-10 w-full flex-shrink-0" />

          <div className="relative flex-shrink-0">
            <DraggableCellList
              cells={cells as any}
              onCellsReorder={handleCellsReorder as any}
              onAddCell={handleAddCellForDnD}
              disabled={!isDragEnabled || readOnly}
              renderCell={(c: any, isDragging?: boolean) => {
                const cell = c as Cell;
                return (
                <div
                  id={`cell-${cell.id}`}
                  data-cell-id={cell.id}
                  className={`relative w-full duration-200 draggable-cell ${isDragging ? 'shadow-lg scale-105' : ''}`}
                >
                  {renderCell(cell)}
                </div>
                );
              }}
            />
          </div>

          <div className="h-20 w-full flex-shrink-0" />
        </div>

        {/* filler clickable area */}
        <div
          className="w-full cursor-text flex-1 relative"
          onClick={(e) => {
            const target = e.target as Element | null;
            if (!ensureHTMLElement(target) || !isBlankArea(target)) return;

            if (cells.length === 0) {
              const id = handleAddCell('markdown', 0);
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setFocusedCellId(id);
                  const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
                  if (el) focusCellEditor(el, true);
                }, 50);
              });
              return;
            }

            const last = cells[cells.length - 1];
            if (last.type === 'markdown') {
              debouncedFocus(() => {
                const containerEl = containerRef.current;
                if (containerEl && focusNotebookAtEnd(containerEl)) {
                  const nodes = containerRef.current?.querySelectorAll('[data-cell-id]');
                  const lastEl = nodes && nodes[nodes.length - 1];
                  const cellId = lastEl?.getAttribute?.('data-cell-id');
                  if (cellId) setFocusedCellId(cellId);
                }
              });
            } else {
              const id = handleAddCell('markdown', -1);
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setFocusedCellId(id);
                  const el = containerRef.current?.querySelector(`[data-cell-id="${id}"]`) as HTMLElement | null;
                  if (el) focusCellEditor(el, true);
                }, 50);
              });
            }
          }}
          style={{ minHeight: '200px', backgroundColor: 'transparent' }}
        >
          {(cells.length === 0 || !lastIsMarkdown) && (
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
            </div>
          )}
        </div>

        <ShortcutsHelp isOpen={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />

        <style>{`
          .jupyter-notebook-editor {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            min-height: 500px;
            height: 100%;
          }
          .jupyter-notebook-editor .code-cell {
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
          }
          .jupyter-notebook-editor .markdown-cell {
            line-height: 1.6;
          }
          .jupyter-notebook-editor .thinking-cell {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
          }
          .jupyter-notebook-editor .draggable-cell {
            transition: all 0.2s ease;
            min-height: 40px;
          }
          .jupyter-notebook-editor .drag-handle {
            opacity: 0;
            transition: opacity 0.2s ease;
          }
          .jupyter-notebook-editor .draggable-cell:hover .drag-handle {
            opacity: 1;
          }
          .slash-command-active {
            background-color: #e0f2fe !important;
            border-radius: 3px;
            padding: 1px 2px;
          }
          .jupyter-notebook-editor .cursor-text:hover {
            background-color: rgba(59, 130, 246, 0.02);
            transition: background-color 0.2s ease;
          }
          .jupyter-notebook-editor .cursor-text:active {
            background-color: rgba(59, 130, 246, 0.05);
          }
        `}</style>
      </div>
    );
  },
);

JupyterNotebookEditor.displayName = 'JupyterNotebookEditor';
export default JupyterNotebookEditor;
