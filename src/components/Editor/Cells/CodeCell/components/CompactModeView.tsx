import React from 'react';
import { ExternalLink, Minimize2, Trash2, InfoIcon } from 'lucide-react';
import { Cell } from '../utils/types';

export interface CompactModeViewProps {
  cell: Cell;
  showToolbar: boolean;
  onClose: () => void;
  onDelete?: (cellId: string) => void;
}

/**
 * Compact view shown when cell is detached but not in detached view
 */
export const CompactModeView: React.FC<CompactModeViewProps> = ({
  cell,
  showToolbar,
  onClose,
  onDelete,
}) => {
  return (
    <div className="code-cell-container bg-white/90 shadow-sm rounded-lg backdrop-blur-sm border-2 border-theme-300">
      <div className="flex items-center justify-between p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-theme-500" />
          <span className="text-sm font-medium text-theme-700">Cell opened in split view</span>
          {cell.description && (
            <div className="flex items-center gap-1">
              <InfoIcon className="w-3 h-3 text-theme-500" />
              <span className="text-xs text-theme-600 truncate max-w-[200px]">
                {cell.description.slice(0, 50)}...
              </span>
            </div>
          )}
        </div>
        <div
          className={`flex items-center gap-2 transition-opacity duration-200 ${
            showToolbar ? 'opacity-100' : 'opacity-60'
          }`}
        >
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-theme-200 rounded text-theme-700"
            title="Return to normal view"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(cell.id)}
              className="p-1.5 hover:bg-red-200 rounded text-red-600"
              title="Delete cell"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
