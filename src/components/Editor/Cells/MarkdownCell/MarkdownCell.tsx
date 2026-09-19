import React, { useMemo, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { Trash2, Eye } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { markdownRemarkPlugins, markdownRehypePlugins } from '../../markdownPreviewPlugins';
import useStore from '@Store/notebookStore';
import type { Cell as StoreCell } from '@Store/models';
import editorLogger from '@Utils/logger/editor_logger';
import { useMarkdownCellViewModel } from './model/useMarkdownCellViewModel';
import { markdownCodeComponents, markdownSoftLineComponents } from '../../MarkdownCodePreview';
import {
  MarkdownImage,
  MarkdownTable,
  MarkdownTableRow,
  MarkdownTableCell,
  MarkdownTableHead,
} from './components/MarkdownElements';
import { markdownEditorTheme, useMarkdownEditorExtensions } from './utils/markdownEditorConfig';

interface MarkdownCellProps {
  cell: StoreCell;
  disableDefaultTitleStyle?: boolean;
}

const MarkdownCell: React.FC<MarkdownCellProps> = ({ cell, disableDefaultTitleStyle = false }) => {
  const vm = useMarkdownCellViewModel(cell);
  const editorExtensions = useMarkdownEditorExtensions(vm.boundaryKeymap);
  const viewMode = useStore((state) => state.viewMode);
  const isFirstCell = useStore((state) => state.cells[0]?.id === cell.id);

  const isDefaultTitle =
    isFirstCell && cell.metadata?.isDefaultTitle === true && !disableDefaultTitleStyle;

  /** ---------- Markdown 渲染组件 ---------- **/
  const markdownComponents = useMemo<Components>(
    () =>
      ({
        ...markdownCodeComponents,
        ...markdownSoftLineComponents,
        img: MarkdownImage,
        table: MarkdownTable,
        tr: MarkdownTableRow,
        td: MarkdownTableCell,
        th: MarkdownTableHead,
        a: ({
          href = '',
          children,
          node: _node,
          ...props
        }) => (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              if (!href) return;
              e.preventDefault();
              import('@Store/previewStore').then(async (mod) => {
                const usePreviewStore = mod.default;
                const useNotebookStore = (await import('@Store/notebookStore')).default;
                const notebookId = useNotebookStore.getState().notebookId;
                if (!notebookId) return;
                const { Backend_BASE_URL } = await import('@Config/base_url');

                const base = (Backend_BASE_URL as string)?.replace(/\/$/, '');
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
      }),
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
                  value={vm.localContent}
                  height="auto"
                  extensions={editorExtensions}
                  onChange={vm.handleChange}
                  className="markdown-editor-codemirror"
                  theme={markdownEditorTheme}
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
                    remarkPlugins={markdownRemarkPlugins}
                    rehypePlugins={markdownRehypePlugins}
                    components={markdownComponents}
                  >
                    {cell.content}
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
