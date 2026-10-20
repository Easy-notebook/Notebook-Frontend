import React from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { formatElapsedTime } from '../utils/outputProcessing';

export interface ExecuteButtonProps {
  isExecuting: boolean;
  isCancelling: boolean;
  elapsedTime: number;
  onExecute: () => void;
  onCancel: () => void;
  disabledReason?: string;
  cancellationUnavailable?: string;
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
  disabledReason,
  cancellationUnavailable,
}) => {
  if (isExecuting) {
    return (
      <button
        onClick={onCancel}
        className="p-2 hover:bg-red-600 rounded flex items-center gap-2"
        disabled={isCancelling || !!cancellationUnavailable}
        title={cancellationUnavailable || 'Cancel execution'}
      >
        {isCancelling || cancellationUnavailable ? (
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
      className="p-2 hover:bg-yellow-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
      title={disabledReason || 'Execute cell (Ctrl+Enter)'}
      disabled={!!disabledReason}
    >
      <Play className="w-4 h-4" />
    </button>
  );
};
