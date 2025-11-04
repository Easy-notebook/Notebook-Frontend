import React from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { DISPLAY_MODES } from '@Store/codeStore';
import { OutputDisplayProps } from '../utils/types';
import { OutputRenderer } from './OutputRenderers';
import { formatElapsedTime } from '../utils/outputProcessing';

/**
 * Placeholder shown while code is executing
 */
export const ExecutingPlaceholder: React.FC<{
  isExecuting: boolean;
  hasOutputs: boolean;
  elapsedTime: number;
}> = ({ isExecuting, hasOutputs, elapsedTime }) => {
  if (!isExecuting || hasOutputs) return null;

  return (
    <div className="p-4 border-t rounded-b-lg flex flex-col items-center justify-center min-h-[100px] bg-gray-50 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="w-5 h-5 animate-spin text-thme-500" />
        <div className="text-sm text-gray-600 font-medium">Executing code...</div>
      </div>
      <div className="text-xs text-gray-500">Time elapsed: {formatElapsedTime(elapsedTime)}</div>
    </div>
  );
};

/**
 * Thinking status display for DSLC mode
 */
export const ThinkingStatus: React.FC<{
  thinkingText: string;
  onClick: () => void;
}> = ({ thinkingText, onClick }) => (
  <div className="flex flex-col justify-center px-2" onClick={onClick}>
    <div
      className="flex items-center gap-2 p-1"
      style={{
        width: 'fit-content',
      }}
    >
      <CheckCircle className="w-4 h-4 text-green-500" />
      <span className="text-sm text-gray-600 font-medium">{thinkingText}</span>
    </div>
  </div>
);

/**
 * Main output display component
 */
export const OutputDisplay: React.FC<OutputDisplayProps> = ({
  outputs,
  isExecuting,
  elapsedTime,
  outputVisible,
  outputUpdateKey,
  cellMode,
  isInDetachedView,
  finished_thinking,
  dslcMode,
  showThinking,
  thinkingText = 'finished thinking',
  onToggleThinking,
}) => {
  return (
    <div className={`${isInDetachedView ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
      {/* Executing placeholder */}
      <ExecutingPlaceholder
        isExecuting={isExecuting}
        hasOutputs={outputs.length > 0}
        elapsedTime={elapsedTime}
      />

      {/* Actual output content */}
      <div
        onClick={onToggleThinking}
        className={`${isInDetachedView ? 'flex-1 min-h-0 overflow-auto' : ''}`}
      >
        {finished_thinking && dslcMode && showThinking ? (
          <ThinkingStatus thinkingText={thinkingText} onClick={onToggleThinking || (() => {})} />
        ) : (
          outputs.length > 0 && (
            <div
              className={`p-4 rounded-b-lg space-y-4 output-container relative transition-all duration-300 ease-in-out ${
                outputVisible ? 'opacity-100' : 'opacity-0'
              }`}
              key={`output-${outputs.length}-${outputUpdateKey}`}
            >
              <div className="relative">
                {isExecuting && cellMode !== DISPLAY_MODES.OUTPUT_ONLY && (
                  <div className="absolute -top-2 right-0 flex items-center gap-1 text-xs bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">
                    <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                    <span className="text-yellow-700">Running</span>
                  </div>
                )}

                {outputs.map((output, index) => (
                  <div
                    key={`${output.key}-${outputUpdateKey}`}
                    className="transition-all duration-300"
                    style={{
                      opacity: outputVisible ? 1 : 0,
                      transform: outputVisible ? 'translateY(0)' : 'translateY(8px)',
                      transition: `opacity 300ms ease-out ${index * 50}ms, transform 300ms ease-out ${index * 50}ms`,
                    }}
                  >
                    <OutputRenderer output={output} />
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
