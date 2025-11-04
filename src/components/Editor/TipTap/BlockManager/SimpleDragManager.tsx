import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import useStore from '../../../../store/notebookStore';
import { handleFileUpload } from '../../../../utils/fileUtils';
import { notebookApiIntegration } from '../../../../services/notebookServices';
import { Backend_BASE_URL } from '../../../../config/base_url';

interface SimpleDragManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const SimpleDragManager: React.FC<SimpleDragManagerProps> = ({ editor, children }) => {
  const [currentCellId, setCurrentCellId] = useState<string | null>(null);
  const [isDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { cells, notebookId } = useStore();

  // 清除隐藏定时器
  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // 延迟隐藏工具栏
  const scheduleHide = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!isDragging) {
        setCurrentCellId(null);
      }
    }, 300);
  }, [clearHideTimeout, isDragging]);

  // 根据DOM元素找到对应的cell
  const findCellByElement = useCallback((element: HTMLElement): string | null => {
    const cellElement = element.closest('[data-cell-id], [data-type="executable-code-block"], [data-type="thinking-cell"], [data-type="markdown-image"]');
    
    if (cellElement) {
      const cellId = (cellElement as HTMLElement).getAttribute('data-cell-id');
      if (cellId) return cellId;
    }

    // 通过ProseMirror位置推断
    if (editor) {
      try {
        const blockElement = element.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre');
        
        if (blockElement) {
          const rect = blockElement.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          
          const coords = editor.view.posAtCoords({ left: x, top: y });
          if (coords) {
            let blockIndex = 0;
            let found = false;
            
            editor.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
              if (found) return false;
              
              if (node.isBlock) {
                const nodeStart = pos;
                const nodeEnd = pos + node.nodeSize;
                
                if (coords.pos >= nodeStart && coords.pos < nodeEnd) {
                  found = true;
                  return false;
                }
                
                if (coords.pos >= nodeEnd) {
                  blockIndex++;
                }
              }
              return true;
            });
            
            if (blockIndex < cells.length) {
              return cells[blockIndex].id;
            }
          }
        }
      } catch (error) {
        console.warn('查找cell失败:', error);
      }
    }

    return null;
  }, [editor, cells]);

  // 显示工具栏
  const showToolbarForElement = useCallback((element: HTMLElement) => {
    clearHideTimeout();
    
    const cellId = findCellByElement(element);
    if (!cellId) return;
    
    if (cellId !== currentCellId) {
      setCurrentCellId(cellId);
    }
  }, [currentCellId, findCellByElement, clearHideTimeout]);

  // 鼠标移动处理
  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const container = containerRef.current;

    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) return;

      const target = event.target as HTMLElement;

      // 查找块级元素
      const blockElement = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre, [data-cell-id], [data-type="executable-code-block"], [data-type="thinking-cell"], [data-type="markdown-image"]');

      if (blockElement) {
        showToolbarForElement(blockElement as HTMLElement);
      } else {
        scheduleHide();
      }
    };

    const handleMouseLeave = () => {
      if (!isDragging) {
        scheduleHide();
      }
    };

    const handleDragOver = (e: DragEvent) => {
      // 允许拖入文件
      if (e.dataTransfer && e.dataTransfer.types?.includes('Files')) {
        e.preventDefault();
      }
    };

    const handleDrop = async (e: DragEvent) => {
      // 文件拖入上传到 .assets
      if (!notebookId) return;
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();

      const files = Array.from(e.dataTransfer.files as any as File[]);

      const uploadConfig = {
        mode: 'restricted',
        maxFileSize: 50 * 1024 * 1024,
        maxFiles: files.length,
        allowedTypes: [
          '.txt', '.md', '.json', '.js', '.py', '.html', '.css', '.csv', '.pdf', '.zip', '.tar', '.gz',
          '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
          '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
          '.mp4', '.webm', '.mov', '.avi', '.mkv'
        ],
        targetDir: '.assets'
      } as any;

      const toast = ({ title, description, variant }: any) => {
        console.log(`${variant || 'info'}: ${title} - ${description}`);
      };

      try {
        await handleFileUpload({
          notebookId,
          files,
          notebookApiIntegration,
          uploadConfig,
          setUploading,
          setUploadProgress,
          setError: setUploadError,
          fileInputRef: fileInputRef as any,
          setIsPreview: () => {},
          toast,
          onUpdate: (_cellId: string, { uploadedFiles }: { uploadedFiles: string[] }) => {
            if (!editor) return;
            (uploadedFiles || []).forEach((name) => {
              const lower = name.toLowerCase();
              const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => lower.endsWith(ext));
              const relPath = `.assets/${name}`;
              const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
              if (isImage) {
                try {
                  // 使用自定义的 markdownImage 节点，保证 TipTap 能稳定解析
                  editor.chain().focus().insertContent(
                    `<div data-type="markdown-image" data-src="${url}" data-alt="${name}" data-title="${name}" data-markdown="![${name}](${url})"></div>`
                  ).run();
                } catch {
                  // 兜底为普通的 <img>，ImageExtension 也支持 parseHTML(img[src])
                  editor.chain().focus().insertContent(`<img src="${url}" alt="${name}" title="${name}" />`).run();
                }
              } else {
                // 其他文件使用 file-attachment 节点，渲染为 LinkCell 卡片
                const markdown = `[${name}](${url})`;
                editor.chain().focus().insertContent(
                  `<div data-type="file-attachment" data-markdown="${markdown}"></div>`
                ).run();
              }
            });
          },
          cellId: '',
          abortControllerRef: abortControllerRef as any,
          fetchFileList: async () => { try { await notebookApiIntegration.listFiles(notebookId); } catch {} },
        });
      } catch (err) {
        console.error('TipTap drop upload failed:', err);
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('dragover', handleDragOver as any);
    container.addEventListener('drop', handleDrop as any);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('dragover', handleDragOver as any);
      container.removeEventListener('drop', handleDrop as any);
      clearHideTimeout();
    };
  }, [editor, showToolbarForElement, scheduleHide, clearHideTimeout, isDragging, notebookId]);

  return (
    <div ref={containerRef} className="relative">
      {children}

      {/* 简化的工具栏 - 已注释 */}
      {/* {showToolbar && currentCellId && (
        <div
          ref={toolbarRef}
          className="fixed z-50 flex flex-col gap-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1"
          style={{
            left: toolbarPosition.x,
            top: toolbarPosition.y,
          }}
          onMouseEnter={() => clearHideTimeout()}
          onMouseLeave={scheduleHide}
        >
          <button
            onClick={moveBlockUp}
            className="p-2 text-gray-600 hover:text-theme-600 hover:bg-theme-50 rounded transition-colors"
            title="向上移动"
            disabled={getCellIndex(currentCellId) === 0}
          >
            <ArrowUp size={16} />
          </button>
          
          <button
            onClick={moveBlockDown}
            className="p-2 text-gray-600 hover:text-theme-600 hover:bg-theme-50 rounded transition-colors"
            title="向下移动"
            disabled={getCellIndex(currentCellId) === cells.length - 1}
          >
            <ArrowDown size={16} />
          </button>
          
          <div className="w-full h-px bg-gray-200 my-1" />
          
          <button
            onClick={duplicateBlock}
            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
            title="复制"
          >
            <Copy size={16} />
          </button>
          
          <button
            onClick={insertNewCell}
            className="p-2 text-gray-600 hover:text-theme-600 hover:bg-theme-50 rounded transition-colors"
            title="插入新cell"
          >
            <Plus size={16} />
          </button>
          
          <button
            onClick={deleteBlock}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )} */}

      {/* CSS样式 - hover效果已禁用 */}
      <style>{`
        /* Hover effects disabled for cells */
        /*
        .ProseMirror p:hover,
        .ProseMirror h1:hover,
        .ProseMirror h2:hover,
        .ProseMirror h3:hover,
        .ProseMirror h4:hover,
        .ProseMirror h5:hover,
        .ProseMirror h6:hover,
        .ProseMirror ul:hover,
        .ProseMirror ol:hover,
        .ProseMirror blockquote:hover,
        .ProseMirror pre:hover,
        [data-cell-id]:hover,
        [data-type="executable-code-block"]:hover,
        [data-type="thinking-cell"]:hover,
        [data-type="markdown-image"]:hover {
          background-color: rgba(66, 133, 244, 0.04);
          border-left: 3px solid rgba(66, 133, 244, 0.3);
          border-radius: 0 4px 4px 0;
          padding-left: 8px;
          margin-left: -11px;
          transition: all 0.15s ease;
        }
        */
      `}</style>
    </div>
  );
};

export default SimpleDragManager;
