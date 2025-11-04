import React, { useRef, useState, useCallback } from 'react';
import { DISPLAY_MODES } from '@Store/codeStore';

// Import hooks
import {
  useCellState,
  useCodeExecution,
  useCellNavigation,
  useOutputProcessing,
  useCodeExpansion,
} from './CodeCell/hooks';

// Import components
import { CellToolbar, CodeEditor, OutputDisplay, CompactModeView } from './CodeCell/components';

// Import types
import { CodeCellProps } from './CodeCell/utils/types';

/**
 * Main CodeCell component - refactored for maintainability
 *
 * This component orchestrates the display and interaction of a code cell,
 * delegating specific concerns to focused hooks and components.
 */
const CodeCell: React.FC<CodeCellProps> = ({
  cell,
  onDelete,
  dslcMode = false,
  finished_thinking = false,
  thinkingText = 'finished thinking',
  isInDetachedView = false,
  isDemoMode = false,
}) => {
  // ========== Refs ==========
  const editorRef = useRef<unknown>(null);
  const codeContainerRef = useRef<HTMLDivElement | null>(null);

  // ========== State ==========
  const [showThinking, setShowThinking] = useState(true);
  const [showToolbar, setShowToolbar] = useState(false);

  // ========== Custom Hooks ==========

  // Cell state (execution, display mode, detached state)
  const {
    isExecuting,
    isCancelling,
    elapsedTime,
    cellMode,
    isDetached,
    isCurrentCell,
    isDslcCommand,
    showAIdebug,
    isDetachedCellFullscreen,
    toggleDetachedCellFullscreen,
    setDetachedCellId,
    setCellMode,
  } = useCellState(cell, isDemoMode);

  // Code execution handlers
  const {
    handleExecute,
    handleCancel,
    handleClearOutput,
    handleChange,
    handleRestart,
    handleCopyCode,
  } = useCodeExecution(cell, dslcMode, isDslcCommand);

  // Navigation handlers
  const { handleKeyDown } = useCellNavigation(cell, editorRef, isCurrentCell, dslcMode);

  // Output processing
  const { processedOutputs, outputVisible, outputUpdateKey } = useOutputProcessing(
    cell,
    isExecuting,
    dslcMode
  );

  // Code expansion/collapse
  const {
    isExpanded,
    isHovering,
    contentHeight,
    codeBlockWrapperRef,
    setIsHovering,
    handleExpand,
    handleCollapse,
  } = useCodeExpansion(cell, processedOutputs, isInDetachedView);

  // ========== Handlers ==========

  // Toggle display mode
  const toggleCellMode = useCallback(() => {
    let newMode;
    if (cellMode === DISPLAY_MODES.COMPLETE) {
      newMode = DISPLAY_MODES.CODE_ONLY;
    } else if (cellMode === DISPLAY_MODES.CODE_ONLY) {
      newMode = DISPLAY_MODES.OUTPUT_ONLY;
    } else {
      newMode = DISPLAY_MODES.COMPLETE;
    }
    setCellMode(cell.id, newMode);
  }, [cellMode, cell.id, setCellMode]);

  // Toggle detached mode
  const handleToggleDetached = useCallback(() => {
    setDetachedCellId(isDetached ? null : cell.id);
  }, [isDetached, cell.id, setDetachedCellId]);

  // Handle key down with special actions
  const handleKeyDownWrapper = useCallback(
    (event: React.KeyboardEvent) => {
      const result = handleKeyDown(event);
      if (result === 'execute') {
        handleExecute();
      }
    },
    [handleKeyDown, handleExecute]
  );

  // Handle collapse with scroll
  const handleCollapseWrapper = useCallback(() => {
    handleCollapse(codeContainerRef);
  }, [handleCollapse]);

  // ========== Rendering Logic ==========

  // DSLC mode visibility
  const shouldHideToolbar = dslcMode;
  const shouldHideCode = dslcMode && processedOutputs.length > 0;

  // Show compact mode if detached but not in detached view
  if (isDetached && !isInDetachedView) {
    return (
      <CompactModeView
        cell={cell}
        showToolbar={showToolbar}
        onClose={() => setDetachedCellId(null)}
        onDelete={onDelete}
      />
    );
  }

  // ========== Main Render ==========
  return (
    <div
      data-cell-id={cell.id}
      className={`code-cell-container codeCell ${
        isInDetachedView ? 'bg-white h-full' : 'bg-white/90 shadow-sm rounded-lg backdrop-blur-sm'
      }`}
      ref={codeContainerRef}
      style={{
        width: finished_thinking && dslcMode && showThinking ? 'fit-content' : '',
        height: isInDetachedView ? '100%' : 'auto',
      }}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      <div
        className={`${
          isInDetachedView ? 'h-full flex flex-col' : 'mb-4 rounded-xl border hover:shadow-md'
        } backdrop-blur-md transition-all duration-500 ease-out
                    ${
                      isExecuting
                        ? 'border-yellow-400/50 shadow-lg bg-white/95'
                        : 'bg-white/90 text-black'
                    }
                    ${isInDetachedView ? '' : 'hover:shadow-md'}
                `}
      >
        {/* Toolbar */}
        {!shouldHideToolbar && (
          <CellToolbar
            isExecuting={isExecuting}
            isCancelling={isCancelling}
            elapsedTime={elapsedTime}
            cellMode={cellMode}
            isDetached={isDetached}
            isInDetachedView={isInDetachedView}
            isDemoMode={isDemoMode}
            processedOutputs={processedOutputs}
            cell={cell}
            showAIdebug={showAIdebug}
            showToolbar={showToolbar}
            onExecute={handleExecute}
            onCancel={handleCancel}
            onRestart={handleRestart}
            onClearOutput={handleClearOutput}
            onToggleCellMode={toggleCellMode}
            onToggleDetached={handleToggleDetached}
            onDelete={onDelete}
            onToggleFullscreen={toggleDetachedCellFullscreen}
            isDetachedCellFullscreen={isDetachedCellFullscreen}
          />
        )}

        {/* Code Editor */}
        {!shouldHideCode &&
          (cellMode === DISPLAY_MODES.COMPLETE || cellMode === DISPLAY_MODES.CODE_ONLY) && (
            <CodeEditor
              cell={cell}
              isExecuting={isExecuting}
              isCurrentCell={isCurrentCell}
              dslcMode={dslcMode}
              isInDetachedView={isInDetachedView}
              contentHeight={contentHeight}
              isExpanded={isExpanded}
              isHovering={isHovering}
              editorRef={editorRef}
              codeBlockWrapperRef={codeBlockWrapperRef}
              onHoverChange={setIsHovering}
              onExpand={handleExpand}
              onCollapse={handleCollapseWrapper}
              onChange={handleChange}
              onKeyDown={handleKeyDownWrapper}
              onCopyCode={handleCopyCode}
            />
          )}

        {/* Output Display */}
        {(cellMode === DISPLAY_MODES.COMPLETE ||
          cellMode === DISPLAY_MODES.OUTPUT_ONLY ||
          shouldHideCode) && (
          <OutputDisplay
            outputs={processedOutputs}
            isExecuting={isExecuting}
            elapsedTime={elapsedTime}
            outputVisible={outputVisible}
            outputUpdateKey={outputUpdateKey}
            cellMode={cellMode}
            isInDetachedView={isInDetachedView}
            finished_thinking={finished_thinking}
            dslcMode={dslcMode}
            showThinking={showThinking}
            thinkingText={thinkingText}
            onToggleThinking={() => setShowThinking(!showThinking)}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(CodeCell);
