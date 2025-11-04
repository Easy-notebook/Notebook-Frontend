import React, { useMemo} from 'react';
import { ExternalLink, Trash2, Minimize2, Maximize2, Split } from 'lucide-react';
import { Icon } from '@fluentui/react/lib/Icon';
import { getFileTypeIconProps, initializeFileTypeIcons } from '@fluentui/react-file-type-icons';
import useStore, { Cell as StoreCell } from '../../../store/notebookStore';
import usePreviewStore from '../../../store/previewStore';
import { Backend_BASE_URL } from '../../../config/base_url';
import { uiLog } from '../../../utils/logger';

// Initialize file type icons
initializeFileTypeIcons();

interface LinkCellProps {
  cell: StoreCell;
  readOnly?: boolean;
  onDelete?: () => void;
  className?: string;
  focused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  isInDetachedView?: boolean;
}

function parseContent(content: string): { href: string; label: string } {
  uiLog.debug('parseContent: Input content', { content });
  
  // 使用更宽松的匹配，寻找最后一个括号对
  const match = content.match(/^\[([^\]]*)\]\((.+)\)$/);
  if (match) {
    const label = match[1].trim();
    const href = match[2].trim();
    uiLog.debug('parseContent: Successfully parsed', { label, href });
    return { href, label };
  }
  
  uiLog.debug('parseContent: No markdown match found, using content as href');
  const href = (content || '').trim();
  const label = href.split(/[\\/]/).pop() || href;
  return { href, label };
}
const LinkCell: React.FC<LinkCellProps> = ({ 
  cell, 
  readOnly = false, 
  onDelete, 
  className = '', 
  onFocus, 
  onBlur, 
  isInDetachedView = false 
}) => {
  const updateCell = useStore(s => s.updateCell);
  const notebookId = useStore(s => s.notebookId);
  const setDetachedCellId = useStore(s => s.setDetachedCellId);
  const detachedCellId = useStore(s => s.detachedCellId);
  const isDetachedCellFullscreen = useStore(s => s.isDetachedCellFullscreen);
  const toggleDetachedCellFullscreen = useStore(s => s.toggleDetachedCellFullscreen);

  // Check if this cell is currently detached
  const isDetached = detachedCellId === cell.id;

  const { href, label } = useMemo(() => {
    const result = parseContent(cell.content || '');
    uiLog.debug('LinkCell: parseContent result', { content: cell.content, result });
    return result;
  }, [cell.content]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateCell(cell.id, e.target.value);
  };

  // Get file extension from href (not label) and icon props
  const fileExtension = useMemo(() => {
    if (!href) return '';

    // Extract extension from href path
    const pathParts = href.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }, [href]);

  const iconProps = useMemo(() => {
    if (!href) return getFileTypeIconProps({ extension: 'generic', size: 32 });

    // Special handling for URLs
    if (/^https?:\/\//i.test(href)) {
      return getFileTypeIconProps({ extension: 'html', size: 32 });
    }

    // Use extension from href path
    const extension = fileExtension || 'generic';
    return getFileTypeIconProps({
      extension,
      size: 32
    });
  }, [href, fileExtension]);

  const normalizeFilePath = (url: string): string | null => {
    uiLog.debug('normalizeFilePath: Processing URL', { url });
    uiLog.debug('normalizeFilePath: Configuration', { Backend_BASE_URL, notebookId });
    
    try {
      const base = Backend_BASE_URL?.replace(/\/$/, '');
      
      // Check for download_file pattern
      const downloadPattern = new RegExp(`^${base}/download_file/${notebookId}/(.+)$`);
      const downloadMatch = url.match(downloadPattern);
      if (downloadMatch && downloadMatch[1]) {
        const filePath = decodeURIComponent(downloadMatch[1]);
        uiLog.debug('normalizeFilePath: Matched download_file pattern', { filePath });
        return filePath;
      }
      
      // Check for assets pattern - should return .assets/filename
      const assetsPattern = new RegExp(`^${base}/assets/${notebookId}/(.+)$`);
      const assetsMatch = url.match(assetsPattern);
      if (assetsMatch && assetsMatch[1]) {
        const filename = decodeURIComponent(assetsMatch[1]);
        const filePath = `.assets/${filename}`;
        uiLog.debug('normalizeFilePath: Matched assets pattern', { filename, filePath });
        return filePath;
      }
    } catch (e) {
      uiLog.warn('normalizeFilePath: Pattern matching error', { error: e });
    }

    const relPattern = new RegExp('^(\\.|\\.\\.|[^:/?#]+$|\\.\\/\\.(assets|sandbox)\\/|\\.(assets|sandbox)\\/)');
    if (relPattern.test(url)) {
      const filePath = url.replace(new RegExp('^\\./'), '');
      uiLog.debug('normalizeFilePath: Matched relative pattern', { filePath });
      return filePath;
    }
    
    if (!/^[a-z]+:\/\//i.test(url) && url.indexOf('/') === -1) {
      uiLog.debug('normalizeFilePath: Simple filename', { url });
      return url;
    }

    uiLog.debug('normalizeFilePath: No pattern matched, returning null');
    return null;
  };

  const openInSplitPreview = async () => {
    uiLog.userInteraction('openInSplitPreview', 'LinkCell', { cellContent: cell.content, notebookId });
    setDetachedCellId(cell.id);

    if (!href || !notebookId) {
      uiLog.warn('LinkCell: Missing href or notebookId');
      return;
    }
    
    // Parse the content to get the actual URL (href is already parsed from content)
    uiLog.debug('LinkCell: Using parsed href', { href });
    const filePath = normalizeFilePath(href);
    uiLog.debug('LinkCell: normalizeFilePath result', { filePath, href });

    if (!filePath) {
      uiLog.info('LinkCell: No valid file path, opening external URL');
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      const fileObj = { name: filePath.split('/').pop() || filePath, path: filePath, type: 'file' } as any;
      uiLog.info('LinkCell: Calling previewFileInSplit', { notebookId, filePath, fileObj });
      await usePreviewStore.getState().previewFileInSplit(notebookId, filePath, { file: fileObj } as any);
      uiLog.info('LinkCell: previewFileInSplit completed successfully');
    } catch (err: any) {
      uiLog.error('LinkCell: Open split preview failed', { error: err });
      try {
        const baseName = (filePath || href).split('/').pop() || '';
        uiLog.info('LinkCell: Trying fallback with baseName', { baseName });
        if (baseName && baseName !== filePath) {
          const fileObj2 = { name: baseName, path: baseName, type: 'file' } as any;
          await usePreviewStore.getState().previewFileInSplit(notebookId, baseName, { file: fileObj2 } as any);
          uiLog.info('LinkCell: Fallback previewFileInSplit completed');
        }
      } catch (e) {
        uiLog.error('LinkCell: Fallback to root failed', { error: e });
      }
    }
  };

  if (!readOnly && !href) {
    // Edit mode when no href is set
    return (
      <div
        className={`w-full border border-theme-200 rounded-lg bg-white shadow-sm p-4 ${className}`}
        onFocus={onFocus}
        onBlur={onBlur}
        data-cell-id={cell.id}
      >
        <input
          type="text"
          value={cell.content || ''}
          onChange={handleChange}
          placeholder="输入文件路径或链接 (例如: ./document.pdf, https://example.com)"
          className="w-full border border-theme-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-500 focus:border-transparent"
          autoFocus
        />
      </div>
    );
  }

  // Show detached state indicator if this cell is in split view
  if (isDetached && !isInDetachedView) {
    return (
      <div className="flex justify-start">
        <div className="max-w-md bg-theme-50/50 border border-theme-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-theme-500" />
              <span className="text-sm font-medium text-theme-700">Attachment opened in split view</span>
            </div>
            <button
              onClick={() => setDetachedCellId(null)}
              className="p-1.5 hover:bg-theme-200 rounded text-theme-700"
              title="Return to normal view"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Attachment card style
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-md bg-white border border-theme-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
        onFocus={onFocus}
        onBlur={onBlur}
        data-cell-id={cell.id}
      >
      <div className="flex items-center p-3 gap-3">
        {/* File Icon */}
        <div className="flex-shrink-0">
          <div
            className="w-10 h-10 flex items-center justify-center rounded"
            style={{
              backgroundColor: (iconProps as any).iconColor ? `${(iconProps as any).iconColor}15` : '#f3f4f6'
            }}
          >
            <Icon {...iconProps} />
          </div>
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div 
            className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-theme-600 transition-colors"
            title={label}
          >
            {label}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {fileExtension && (
              <span className="uppercase">{fileExtension} • </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Debug info */}
          {/* Debug: isInDetachedView=${isInDetachedView}, isDetached=${isDetached} */}
          {isInDetachedView ? (
            /* Detached view toolbar */
            <>
              <button
                onClick={toggleDetachedCellFullscreen}
                className="p-1.5 hover:bg-gray-200 rounded"
                title={isDetachedCellFullscreen ? "Switch to split view" : "Switch to fullscreen"}
                type="button"
              >
                {isDetachedCellFullscreen ? <Split size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={() => setDetachedCellId(null)}
                className="p-1.5 hover:bg-red-200 rounded text-red-600"
                title="Close detached view"
                type="button"
              >
                <Minimize2 size={16} />
              </button>
            </>
          ) : (
            /* Normal view actions */
            <>
              <button
                onClick={(e) => {
                  uiLog.userInteraction('split_preview_button_click', 'LinkCell.actions.splitPreview');
                  e.preventDefault();
                  e.stopPropagation();
                  openInSplitPreview();
                }}
                className="p-1.5 text-gray-500 hover:text-theme-600 hover:bg-theme-50 rounded transition-colors"
                title="split preview"
                type="button"
              >
                <ExternalLink size={16} />
              </button>

              {onDelete && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="delete"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit input (if not readonly and content exists)
      {!readOnly && href && (
        <div className="px-3 pb-3">
          <input
            type="text"
            value={cell.content || ''}
            onChange={handleChange}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-theme-500"
            placeholder="编辑路径..."
          />
        </div>
      )} */}

      {/* Warning for file:// protocol */}
      {href.startsWith('file://') && (
        <div className="px-3 pb-3">
          <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
            ⚠️ Browser may restrict file:// protocol, it is recommended to use relative paths
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default LinkCell;