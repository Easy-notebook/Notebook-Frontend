import React, { useMemo, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { Trash2, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import useStore from '@Store/notebookStore';
import type { Cell as StoreCell } from '@Store/models';
import editorLogger from '@Utils/logger/editor_logger';
import { useMarkdownCellViewModel } from './model/useMarkdownCellViewModel';
import { CodeBlock } from './components/CodeBlock';
import {
  MarkdownImage,
  MarkdownTable,
  MarkdownTableRow,
  MarkdownTableCell,
  MarkdownTableHead,
} from './components/MarkdownElements';
import { markdownHighlighting } from './utils/markdownHighlighting';

interface MarkdownCellProps {
  cell: StoreCell;
  disableDefaultTitleStyle?: boolean;
}

const MarkdownCell: React.FC<MarkdownCellProps> = ({ cell, disableDefaultTitleStyle = false }) => {
  const vm = useMarkdownCellViewModel(cell);
  const viewMode = useStore((state) => state.viewMode);

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
        p: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
          if (typeof children === 'string') {
            const processedChildren = children
              .split('\n')
              .reduce((acc: React.ReactNode[], part: string, index: number) => {
                if (index > 0) acc.push(<br key={`br-${index}`} />);
                acc.push(part);
                return acc;
              }, []);
            return <p {...props}>{processedChildren}</p>;
          }
          return <p {...props}>{children}</p>;
        },
        a: ({
          href = '',
          children,
          ...props
        }: {
          href?: string;
          children?: React.ReactNode;
          [key: string]: unknown;
        }) => (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              if (!href) return;
              e.preventDefault();
              import('@Store/previewStore').then(async (mod) => {
                const usePreviewStore = (mod as any).default;
                const useNotebookStore = (await import('@Store/notebookStore')).default as any;
                const notebookId = useNotebookStore.getState().notebookId;
                if (!notebookId) return;
                const { Backend_BASE_URL } = await import('@Config/base_url');

                const base = (Backend_BASE_URL as any)?.replace(/\/$/, '');
                let filePath: string | null = null;
                try {
                  const pattern = new RegExp(`^${base}/download_file/${notebookId}/(.+)$`);
                  const m = href.match(pattern);
                  if (m && m[1]) filePath = decodeURIComponent(m[1]);
                } catch {
                  // Ignore regex parsing errors
                }
                if (!filePath) {
                  const relPattern = new RegExp(
                    '^(\\.|\\.\\.|[^:/?#]+$|\\.\\/\\assets\\/|\\assets\\/)'
                  );
                  if (relPattern.test(href)) {
                    filePath = href.replace(new RegExp('^\\./'), '');
                  } else if (
                    !new RegExp('^[a-z]+://', 'i').test(href) &&
                    href.indexOf('/') === -1
                  ) {
                    filePath = href;
                  }
                }

                if (!filePath) {
                  window.open(href, '_blank', 'noopener,noreferrer');
                  return;
                }

                try {
                  const fileObj = {
                    name: filePath.split('/').pop() || filePath,
                    path: filePath,
                    type: 'file' as const,
                  };
                  await usePreviewStore
                    .getState()
                    .previewFile(notebookId, filePath, { file: fileObj });
                  if (usePreviewStore.getState().previewMode !== 'file') {
                    usePreviewStore.getState().changePreviewMode();
                  }
                } catch (err) {
                  console.error('Markdown link split preview failed:', err);
                  try {
                    const baseName = (filePath || href).split('/').pop() || '';
                    if (baseName && baseName !== filePath) {
                      const fileObj2 = { name: baseName, path: baseName, type: 'file' as const };
                      await usePreviewStore
                        .getState()
                        .previewFile(notebookId, baseName, { file: fileObj2 });
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
    []
  );

  /** ---------- 编辑/聚焦日志 ---------- **/
  useEffect(() => {
    editorLogger.logEditModeChange(cell.id, cell.type, vm.isEditing);
    if (vm.isEditing && vm.editorRef) {
      vm.editorRef.focus();
      editorLogger.logFocusChange(cell.id, cell.type, true);
    }
  }, [vm.isEditing, cell.id, cell.type, vm.editorRef]);

  return (
    <>
      <style>
        {`
          .katex, .katex-display { font-size: 1.5em !important; user-select: all !important; }
          .katex-display { text-align: center; }
        `}
      </style>
      <div className="relative group" data-cell-id={cell.id}>
        <div className={`markdown-cell ${!vm.hasContent && !vm.isEditing ? 'min-h-[20px]' : ''}`}>
          <div
            className="flex items-start relative"
            onMouseEnter={() => vm.setShowButtons(true)}
            onMouseLeave={() => vm.setShowButtons(false)}
          >
            <div className="flex-grow prose w-full pb-0 mb-0 selection:bg-theme-200">
              {vm.isEditing ? (
                <CodeMirror
                  onCreateEditor={vm.setEditorRef}
                  value={cell.content}
                  height="auto"
                  extensions={[
                    markdown(),
                    EditorView.lineWrapping,
                    syntaxHighlighting(markdownHighlighting),
                    vm.boundaryKeymap, // ★ 拦截方向键做跨 cell
                  ]}
                  onChange={vm.handleChange}
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
                  onKeyDown={vm.handleKeyDown}
                  onBlur={vm.handleBlur}
                  autoFocus
                />
              ) : (
                <div
                  className={`text-lg leading-relaxed markdown-cell min-h-[25px] pb-0 mb-0 selection:bg-theme-200 ${
                    isDefaultTitle ? 'default-title-markdown' : ''
                  } focus:outline-none focus:ring-2 focus:ring-theme-300 focus:ring-opacity50`}
                  onDoubleClick={vm.toggleEditing}
                  onClick={(event) => {
                    if (!vm.isEditing) {
                      (event.target as HTMLElement)?.focus();
                    }
                  }}
                  onKeyDown={vm.handleKeyDown}
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
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={markdownComponents}
                  >
                    {cell.content.replace(/(?<!\n)\n(?!\n)/g, '  \n')}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {(viewMode === 'create' || viewMode === 'step') && (
              <div
                className={`absolute -right-14 top-1 flex items-center transition-opacity duration-200 ${
                  vm.cellShowButtons || vm.isEditing ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {vm.isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      vm.toggleEditing();
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded"
                  >
                    <Eye size={14} />
                  </button>
                )}
                {/* Check if deleteCell is available in store, but we use vm.deleteCell */}
                {!isDefaultTitle && cell.content !== '# Untitled' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      vm.deleteCell();
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
