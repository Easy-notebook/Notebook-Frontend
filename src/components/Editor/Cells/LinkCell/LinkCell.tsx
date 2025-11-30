import React from 'react';
import { ExternalLink, Trash2, Minimize2, Maximize2, Split } from 'lucide-react';
import { Icon } from '@fluentui/react/lib/Icon';
import { uiLog } from '@Utils/logger';
import { Cell as StoreCell } from '@Store/models';
import { useLinkCellViewModel } from './model/useLinkCellViewModel';

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

const LinkCell: React.FC<LinkCellProps> = ({
  cell,
  readOnly = false,
  onDelete,
  className = '',
  onFocus,
  onBlur,
  isInDetachedView = false,
}) => {
  const vm = useLinkCellViewModel(cell);

  if (!readOnly && !vm.href) {
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
          onChange={vm.handleChange}
          placeholder="输入文件路径或链接 (例如: ./document.pdf, https://example.com)"
          className="w-full border border-theme-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-500 focus:border-transparent"
          autoFocus
        />
      </div>
    );
  }

  // Show detached state indicator if this cell is in split view
  if (vm.isDetached && !isInDetachedView) {
    return (
      <div className="flex justify-start">
        <div className="max-w-md bg-theme-50/50 border border-theme-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-theme-500" />
              <span className="text-sm font-medium text-theme-700">
                Attachment opened in split view
              </span>
            </div>
            <button
              onClick={() => vm.setDetachedCellId(null)}
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
                backgroundColor: (vm.iconProps as any).iconColor
                  ? `${(vm.iconProps as any).iconColor}15`
                  : '#f3f4f6',
              }}
            >
              <Icon {...vm.iconProps} />
            </div>
          </div>

          {/* File Info */}
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-theme-600 transition-colors"
              title={vm.label}
            >
              {vm.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {vm.fileExtension && <span className="uppercase">{vm.fileExtension} • </span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isInDetachedView ? (
              /* Detached view toolbar */
              <>
                <button
                  onClick={vm.toggleDetachedCellFullscreen}
                  className="p-1.5 hover:bg-gray-200 rounded"
                  title={
                    vm.isDetachedCellFullscreen ? 'Switch to split view' : 'Switch to fullscreen'
                  }
                  type="button"
                >
                  {vm.isDetachedCellFullscreen ? <Split size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  onClick={() => vm.setDetachedCellId(null)}
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
                    uiLog.userInteraction(
                      'split_preview_button_click',
                      'LinkCell.actions.splitPreview'
                    );
                    e.preventDefault();
                    e.stopPropagation();
                    vm.openInSplitPreview();
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

        {/* Warning for file:// protocol */}
        {vm.href.startsWith('file://') && (
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
