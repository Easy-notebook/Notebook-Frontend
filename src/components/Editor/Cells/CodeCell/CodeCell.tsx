import React, { useRef } from 'react';
import { DISPLAY_MODES } from '@Store/codeStore';
import { useCodeCellViewModel } from './model/useCodeCellViewModel';

// Import components
import { CellToolbar, CodeEditor, OutputDisplay, CompactModeView } from './components';

// Import types
import { CodeCellProps, ReactCodeMirrorRef } from './utils/types';

/**
 * Main CodeCell component - refactored to use OOP ViewModel
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
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const codeContainerRef = useRef<HTMLDivElement | null>(null);
  const codeBlockWrapperRef = useRef<HTMLDivElement | null>(null);

  // ========== ViewModel ==========
  const vm = useCodeCellViewModel(
    cell,
    dslcMode,
    isDemoMode,
    isInDetachedView,
    editorRef,
    codeBlockWrapperRef,
    codeContainerRef
  );

  // ========== Rendering Logic ==========

  // DSLC mode visibility
  const shouldHideToolbar = dslcMode;
  const shouldHideCode = dslcMode && vm.processedOutputs.length > 0;

  // Show compact mode if detached but not in detached view
  if (vm.isDetached && !isInDetachedView) {
    return (
      <CompactModeView
        cell={cell}
        showToolbar={vm.showToolbar}
        onClose={() => vm.setDetachedCellId(null)}
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
        width: finished_thinking && dslcMode && vm.showThinking ? 'fit-content' : '',
        height: isInDetachedView ? '100%' : 'auto',
      }}
      onMouseEnter={() => vm.setShowToolbar(true)}
      onMouseLeave={() => vm.setShowToolbar(false)}
    >
      <div
        className={`${
          isInDetachedView ? 'h-full flex flex-col' : 'rounded-xl border hover:shadow-md'
        } backdrop-blur-md transition-all duration-500 ease-out
                    ${
                      vm.isExecuting
                        ? 'border-yellow-400/50 shadow-lg bg-white/95'
                        : 'bg-white/90 text-black'
                    }
                    ${isInDetachedView ? '' : 'hover:shadow-md'}
                `}
      >
        {/* Cell ID Overlay */}
        {vm.showCellIds && (
          <div
            className="absolute top-0 right-0 z-50 px-2 py-1 text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400 rounded-bl-lg opacity-80 cursor-pointer hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(cell.id);
            }}
            title="Click to copy Cell ID"
          >
            {cell.id}
          </div>
        )}

        {/* Toolbar */}
        {!shouldHideToolbar && (
          <CellToolbar
            isExecuting={vm.isExecuting}
            isCancelling={vm.isCancelling}
            elapsedTime={vm.elapsedTime}
            cellMode={vm.cellMode}
            isDetached={vm.isDetached}
            isInDetachedView={isInDetachedView}
            isDemoMode={isDemoMode}
            processedOutputs={vm.processedOutputs}
            cell={cell}
            showAIdebug={vm.showAIdebug}
            showToolbar={vm.showToolbar}
            onExecute={vm.execute}
            onCancel={vm.cancel}
            onRestart={vm.restart}
            onClearOutput={vm.clearOutput}
            onToggleCellMode={vm.toggleCellMode}
            onToggleDetached={vm.toggleDetached}
            onDelete={onDelete}
            onToggleFullscreen={vm.toggleDetachedCellFullscreen}
            isDetachedCellFullscreen={vm.isDetachedCellFullscreen}
          />
        )}

        {/* Code Editor */}
        {!shouldHideCode &&
          (vm.cellMode === DISPLAY_MODES.COMPLETE || vm.cellMode === DISPLAY_MODES.CODE_ONLY) && (
            <CodeEditor
              cell={cell}
              content={vm.localContent}
              isExecuting={vm.isExecuting}
              isCurrentCell={vm.isCurrentCell}
              dslcMode={dslcMode}
              isInDetachedView={isInDetachedView}
              contentHeight={vm.contentHeight}
              isExpanded={vm.isExpanded}
              isHovering={vm.isHovering}
              editorRef={editorRef}
              codeBlockWrapperRef={codeBlockWrapperRef}
              onHoverChange={(h) => vm.setIsHovering(h)}
              onExpand={vm.handleExpand}
              onCollapse={vm.handleCollapse}
              onChange={vm.handleChange}
              onKeyDown={vm.handleKeyDown}
              onCopyCode={vm.copyCode}
            />
          )}

        {/* Output Display */}
        {(vm.cellMode === DISPLAY_MODES.COMPLETE ||
          vm.cellMode === DISPLAY_MODES.OUTPUT_ONLY ||
          shouldHideCode) && (
          <OutputDisplay
            outputs={vm.processedOutputs}
            isExecuting={vm.isExecuting}
            elapsedTime={vm.elapsedTime}
            outputVisible={vm.outputVisible}
            outputUpdateKey={vm.outputUpdateKey}
            cellMode={vm.cellMode}
            isInDetachedView={isInDetachedView}
            finished_thinking={finished_thinking}
            dslcMode={dslcMode}
            showThinking={vm.showThinking}
            thinkingText={thinkingText}
            onToggleThinking={() => vm.setShowThinking(!vm.showThinking)}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(CodeCell);
