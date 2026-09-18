import React from 'react';
import { Trash2, ExternalLink, Minimize2, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { Cell as StoreCell } from '@Store/models';
import { useAIThinkingCellViewModel } from './model/useAIThinkingCellViewModel';

interface AIThinkingCellProps {
  cell: StoreCell;
  onDelete?: (cellId: string) => void;
  isInDetachedView?: boolean;
}

const AIThinkingCell: React.FC<AIThinkingCellProps> = ({
  cell,
  onDelete,
  isInDetachedView = false,
}) => {
  const vm = useAIThinkingCellViewModel(cell);

  const agentName = cell.agentName || 'AI';
  const customText = cell.customText || null;
  const textArray = cell.textArray || [];

  // Compact Mode
  const renderCompactMode = () => (
    <div
      data-cell-id={cell.id}
      className="thinking-cell-container bg-white/90 shadow-sm rounded-lg backdrop-blur-sm border-2 border-green-300"
      onMouseEnter={() => vm.setShowToolbar(true)}
      onMouseLeave={() => vm.setShowToolbar(false)}
    >
      <div className="flex items-center justify-between p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-green-700">
            AI Thinking Cell opened in split view
          </span>
        </div>
        <div
          className={`flex items-center gap-2 transition-opacity duration-200 ${vm.showToolbar ? 'opacity-100' : 'opacity-60'}`}
        >
          <button
            onClick={() => vm.setDetachedCellId(null)}
            className="p-1.5 hover:bg-green-200 rounded text-green-700"
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

  if (vm.isDetached && !isInDetachedView) {
    return renderCompactMode();
  }

  // Collapsed Mode
  if (!vm.isExpanded && !isInDetachedView) {
    return (
      <div
        data-cell-id={cell.id}
        className="thinking-cell-container bg-white/90 shadow-sm rounded-lg backdrop-blur-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200"
        onMouseEnter={() => vm.setShowToolbar(true)}
        onMouseLeave={() => vm.setShowToolbar(false)}
      >
        <div
          className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 transition-colors duration-200"
          onClick={() => vm.setIsExpanded(true)}
        >
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 chevron-icon" />
          <div className="flex-shrink-0">
            <Brain className="w-4 h-4 text-green-500" />
          </div>

          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-medium text-gray-700">
              {customText || `${agentName} Thinking`}
            </span>

            <div className="w-4 h-4 relative">
              <div
                className="absolute inset-0 border-2 rounded-full border-transparent"
                style={{
                  borderLeftColor: '#41B883',
                  borderTopColor: '#3490DC',
                  transform: `rotate(${vm.rotation}deg)`,
                }}
              />
            </div>

            <span className="text-xs text-gray-500">{vm.seconds}s</span>
            <span className="text-sm text-gray-500">{'.'.repeat(1 + (vm.seconds % 3))}</span>

            {textArray && textArray.length > 1 && (
              <span className="text-xs text-gray-400 ml-2">({textArray.length} states)</span>
            )}
          </div>

          {vm.showToolbar && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {onDelete && (
                <button
                  onClick={() => onDelete(cell.id)}
                  className="p-1.5 hover:bg-red-100 rounded text-red-600 transition-colors"
                  title="Delete cell"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Expanded Mode
  return (
    <div
      data-cell-id={cell.id}
      className={`thinking-cell-container expanded ${
        isInDetachedView ? 'bg-white h-full' : 'bg-white/90 shadow-sm rounded-lg backdrop-blur-sm'
      }`}
      onMouseEnter={() => vm.setShowToolbar(true)}
      onMouseLeave={() => vm.setShowToolbar(false)}
    >
      {vm.showToolbar && !isInDetachedView && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 p-1 z-20">
          <button
            onClick={() => vm.setIsExpanded(false)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
            title="Collapse"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {!vm.isDetached && (
            <button
              onClick={() => vm.setDetachedCellId(cell.id)}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
              title="Open in split view"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(cell.id)}
              className="p-1.5 hover:bg-red-100 rounded text-red-600"
              title="Delete cell"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="w-full relative overflow-hidden rounded-full">
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            background: `linear-gradient(90deg, 
                            rgba(255,255,255,0) 0%, 
                            rgba(65,184,131,0.08) 20%, 
                            rgba(52,144,220,0.12) 50%, 
                            rgba(101,116,205,0.08) 80%, 
                            rgba(255,255,255,0) 100%)`,
            backgroundSize: '200% 100%',
            backgroundPosition: `${vm.gradientPosition}% 0%`,
          }}
        />

        <div className="w-full flex items-center justify-start relative z-10">
          <div
            className="inline-flex items-center px-3 py-1 rounded-full"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid #41B883',
              opacity: vm.opacity,
              transition: 'opacity 0.3s ease',
            }}
          >
            <div className="mr-2 flex-shrink-0">
              <div className="w-4 h-4 relative">
                <div
                  className="absolute inset-0 border-2 rounded-full border-transparent"
                  style={{
                    borderLeftColor: '#41B883',
                    borderTopColor: '#3490DC',
                    transform: `rotate(${vm.rotation}deg)`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center">
              <span className="text-xs font-medium" style={{ color: '#41B883' }}>
                {vm.displayText}
                <span className="inline-block ml-1">{'.'.repeat(1 + (vm.seconds % 3))}</span>
              </span>

              <span className="text-xs ml-2 font-medium" style={{ color: '#3490DC' }}>
                {vm.seconds}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIThinkingCell;
