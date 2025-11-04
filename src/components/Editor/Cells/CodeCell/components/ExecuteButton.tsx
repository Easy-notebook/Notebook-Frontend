import React from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { formatElapsedTime } from '../utils/outputProcessing';

export interface ExecuteButtonProps {
  isExecuting: boolean;
  isCancelling: boolean;
  elapsedTime: number;
  onExecute: () => void;
  onCancel: () => void;
}

/**
 * Execute/Cancel button for code cells
 */
export const ExecuteButton: React.FC<ExecuteButtonProps> = ({
  isExecuting,
  isCancelling,
  elapsedTime,
  onExecute,
  onCancel,
}) => {
  if (isExecuting) {
    return (
      <button
        onClick={onCancel}
        className="p-2 hover:bg-red-600 rounded flex items-center gap-2"
        disabled={isCancelling}
        title="Cancel execution"
      >
        {isCancelling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Square className="w-4 h-4" />
            <span className="text-xs">{formatElapsedTime(elapsedTime)}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onExecute}
      className="p-2 hover:bg-yellow-600 rounded"
      title="Execute cell (Ctrl+Enter)"
    >
      <Play className="w-4 h-4" />
    </button>
  );
};
