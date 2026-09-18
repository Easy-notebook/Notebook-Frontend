import React from 'react';
import ReactMarkdown from 'react-markdown';
import {
  RefreshCw,
  X,
  ExternalLink,
  Minimize2,
  Trash2,
  InfoIcon,
  Sparkles,
  Code,
  Monitor,
  Maximize2,
  Split,
} from 'lucide-react';
import { DISPLAY_MODES } from '@Store/codeStore';
import useStore from '@Store/notebookStore';
import { CellToolbarProps } from '../utils/types';
import { ExecuteButton } from './ExecuteButton';
import { DisplayModeButton } from './DisplayModeButton';

/**
 * Cell toolbar with all control buttons
 */
export const CellToolbar: React.FC<CellToolbarProps> = ({
  isExecuting,
  isCancelling,
  elapsedTime,
  cellMode,
  isDetached,
  isInDetachedView,
  isDemoMode,
  processedOutputs,
  cell,
  showAIdebug,
  showToolbar,
  onExecute,
  onCancel,
  onRestart,
  onClearOutput,
  onToggleCellMode,
  onToggleDetached,
  onDelete,
  onToggleFullscreen,
  isDetachedCellFullscreen,
}) => {
  const { setCurrentCell } = useStore();

  const handleAIDebug = () => {
    console.log('AI Debug clicked!');
    setCurrentCell(cell.id);
  };

  return (
    <div
      className={`${
        isInDetachedView ? 'flex-shrink-0' : ''
      } flex items-center justify-between p-2 ${
        isInDetachedView ? 'border-b border-gray-200' : 'rounded-t-lg border-none'
      } transition-opacity duration-200 ${
        isInDetachedView ? 'opacity-100' : showToolbar ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex items-center gap-2">
        <ExecuteButton
          isExecuting={isExecuting}
          isCancelling={isCancelling}
          elapsedTime={elapsedTime}
          onExecute={onExecute}
          onCancel={onCancel}
        />

        {!isInDetachedView && (
          <>
            <button
              onClick={onRestart}
              className="p-2 hover:bg-theme-600 rounded"
              title="Restart kernel"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClearOutput}
              className="p-2 hover:bg-yellow-600 rounded"
              disabled={!processedOutputs.length}
              title="Clear outputs"
            >
              <X className="w-4 h-4" />
            </button>
            <DisplayModeButton
              cellMode={cellMode}
              onToggle={onToggleCellMode}
              disabled={isDemoMode}
            />
            <button
              onClick={onToggleDetached}
              className={`p-2 hover:bg-theme-600 rounded ${
                isDetached ? 'bg-theme-500 text-white' : ''
              }`}
              title={isDetached ? 'Dock to main view' : 'Open in detached window'}
            >
              {isDetached ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(cell.id)}
                className="p-2 hover:bg-gray-600 rounded text-red-500"
                title="Delete cell"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {isInDetachedView && (
          <>
            <button
              onClick={onClearOutput}
              className="p-2 hover:bg-yellow-600 rounded"
              disabled={!processedOutputs.length}
              title="Clear outputs"
            >
              <X className="w-4 h-4" />
            </button>
            {/* Display mode toggle for detached view */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => onToggleCellMode()}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  cellMode === DISPLAY_MODES.CODE_ONLY
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Show code only"
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                onClick={() => onToggleCellMode()}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  cellMode === DISPLAY_MODES.OUTPUT_ONLY
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Show output only"
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
            {/* Fullscreen toggle */}
            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                className="p-2 hover:bg-gray-200 rounded"
                title={isDetachedCellFullscreen ? 'Switch to split view' : 'Switch to fullscreen'}
              >
                {isDetachedCellFullscreen ? (
                  <Split className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}
            {/* Close detached view */}
            <button
              onClick={onToggleDetached}
              className="p-2 hover:bg-red-200 rounded text-red-600"
              title="Close detached view"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Right side: AI Debug / Tooltip */}
      <div className="flex items-center gap-2 relative">
        {(cell.description || cell.metadata?.debug?.bugAnalysis) && (
          <>
            <button className="peer p-2 text-black rounded-md hover:bg-theme-100">
              <InfoIcon className="w-4 h-4" />
            </button>
            <div className="absolute top-full right-0 px-5 py-3 rounded-lg opacity-0 peer-hover:opacity-100 transition-opacity w-[320px] break-words invisible peer-hover:visible z-50">
              <div className="absolute inset-0 rounded-lg shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-r from-theme-100/50 via-purple-100/50 to-pink-100/50 animate-gradient" />
              </div>
              <div className="relative z-10">
                <ReactMarkdown className="text-[15px] leading-relaxed tracking-wide text-gray-800">
                  {(
                    cell.metadata?.debug?.bugAnalysis ||
                    cell.description ||
                    'no ai description'
                  ).replace(/(?<!\n)\n(?!\n)/g, '  \n')}
                </ReactMarkdown>
                {cell.metadata?.debug?.debugStartTime && cell.metadata?.debug?.bugAnalysis && (
                  <div className="mt-2 pt-2 border-t border-gray-200/50 text-xs text-gray-500">
                    Analysis time: {new Date(cell.metadata.debug.debugStartTime).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {showAIdebug && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleAIDebug}
              className="px-2 py-1 bg-theme-600 text-white rounded-md relative transition-all duration-300 ease-in-out hover:bg-theme-700 hover:ring-2 hover:ring-theme-300 hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-theme-400 shadow-lg"
              title="AI Debug"
            >
              <span className="flex items-center gap-1">
                <Sparkles size={14} /> Debug
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
