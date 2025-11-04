import React, { useEffect, useRef, useState } from 'react';
import DSLCPipeline from '../../Senario/Workflow/Pipeline';
import CreateMode from '../../Senario/View/CreateMode';
import DemoMode from '../../Senario/View/DemoMode';
import DetachedCellView from './DetachedCellView';
import WorkflowPanel from './WorkflowPanel';
import { findCellsByStep } from '../../../utils/markdownParser';
import useStore from '../../../store/notebookStore';
import PreviewApp from '../Display/PreviewApp';
import { Splitter } from 'antd';

interface MainContentProps {
  cells: any[];
  viewMode: string;
  tasks: any[];
  currentPhaseId: string | null;
  currentStepIndex: number;
  getCurrentViewCells: () => any[];
  handleAddCell: (type: string, index?: number) => void;
  renderCell: (cell: any) => JSX.Element | null;
  renderStepNavigation: () => JSX.Element | null;
  // Navigation handlers for DemoMode

  handlePreviousStep?: () => void;
  handleNextStep?: () => void;
  handlePreviousPhase?: () => void;
  handleNextPhase?: () => void;
  isFirstPhase?: boolean;
  isLastPhase?: boolean;
}
// 内联组件：可拖拽分屏
const ResizableSplit: React.FC<{ renderLeft: () => JSX.Element; renderRight: () => JSX.Element }>
  = ({ renderLeft, renderRight }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('notebook_split_left_width');
      if (saved) return Math.min(80, Math.max(20, Number(saved)));
    } catch {}
    return 50; // default percent
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('notebook_split_left_width', String(leftWidth)); } catch {}
  }, [leftWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(80, Math.max(20, percent)));
    };
    const onMouseUp = () => setDragging(false);
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  return (
    <div ref={containerRef} className="w-full h-full flex select-none">
      <div className="h-full border-r border-gray-200 overflow-hidden" style={{ width: `${leftWidth}%` }}>
        <div className="w-full h-full overflow-auto">
          {renderLeft()}
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize split"
        className={`w-1.5 cursor-col-resize bg-gray-200 hover:bg-gray-300 active:bg-gray-400 ${dragging ? 'bg-gray-400' : ''}`}
        onMouseDown={() => setDragging(true)}
        onDoubleClick={() => setLeftWidth(50)}
        title="拖动调整分栏宽度，双击重置"
      />
      <div className="h-full overflow-hidden" style={{ width: `${100 - leftWidth}%` }}>
        {renderRight()}
      </div>
    </div>
  );
};

const MainContent: React.FC<MainContentProps> = ({
  cells,
  viewMode,
  tasks,
  currentPhaseId,
  currentStepIndex,
  handleAddCell,
  renderCell,
  handlePreviousStep,
  handleNextStep,
  handlePreviousPhase,
  handleNextPhase,
  isFirstPhase,
  isLastPhase
}) => {
  const { detachedCellId, isDetachedCellFullscreen, getDetachedCell } = useStore();
  const detachedCell = getDetachedCell();

  const shouldShowDSLCUI = cells.length === 0;
  const shouldRunDSLCInBackground = viewMode === 'demo' || viewMode === 'create';
  const shouldAlwaysRenderDSLC = shouldShowDSLCUI || shouldRunDSLCInBackground;

  // 全屏：link 类型改为显示 PreviewApp，其它保持 DetachedCellView
  if (detachedCellId && isDetachedCellFullscreen) {
    if (detachedCell?.type === 'link') {
      return <PreviewApp />;
    }
    return <DetachedCellView />;
  }

  // 如果有独立窗口且是分屏模式，渲染分屏布局（改用 Antd Splitter）
  if (detachedCellId && !isDetachedCellFullscreen) {
    return (
      <div className="w-full h-full">
        <Splitter onResizeEnd={(sizes) => {
          // 将左侧面板宽度百分比持久化（与旧逻辑兼容）
          try {
            const total = sizes.reduce((a, b) => a + b, 0);
            const leftPercent = (sizes[0] / total) * 100;
            localStorage.setItem('notebook_split_left_width', String(Math.min(80, Math.max(20, leftPercent))));
          } catch {}
        }}>
          <Splitter.Panel defaultSize={'50%'} min={'20%'} max={'80%'}>
            {shouldShowDSLCUI ? (
              <div className="w-full h-full" style={{ zIndex: 1 }}>
                <DSLCPipeline onAddCell={handleAddCell} />
              </div>
            ) : shouldRunDSLCInBackground ? (
              <>
                {/* Hidden DSLC for background workflow */}
                <div className="hidden w-full h-full" style={{ zIndex: -1 }}>
                  <DSLCPipeline onAddCell={handleAddCell} />
                </div>
                {/* Show other modes UI */}
                <div style={{ zIndex: 10 }}>{renderOtherModes()}</div>
              </>
            ) : (
              <div style={{ zIndex: 10 }}>{renderOtherModes()}</div>
            )}
          </Splitter.Panel>
          <Splitter.Panel>
            {detachedCell?.type === 'link' ? (
              <div className="w-full h-full">
                <PreviewApp />
              </div>
            ) : (
              <DetachedCellView />
            )}
          </Splitter.Panel>
        </Splitter>
      </div>
    );
  }

  return (
    <>
      {/* WorkflowPanel - 工作流面板组件，显示工作流确认对话框和进度条 */}
      <WorkflowPanel />

      {/* Always render DSLCPipeline when needed - visible or invisible */}
      {shouldAlwaysRenderDSLC && (
        <div
          className={shouldShowDSLCUI ? 'block w-full h-full' : 'absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none'}
          style={{ zIndex: shouldShowDSLCUI ? 100 : -1 }}
        >
          <DSLCPipeline
            onAddCell={handleAddCell}
          />
        </div>
      )}

      {/* Render other modes when DSLC UI is hidden */}
      {!shouldShowDSLCUI && (
        <div style={{ zIndex: 10 }}>
          {renderOtherModes()}
        </div>
      )}
    </>
  );

  function renderOtherModes() {
    if (viewMode === 'demo') {
      return (
        <DemoMode
          tasks={tasks}
          currentPhaseId={currentPhaseId || ''}
          currentStepIndex={currentStepIndex}
          cells={cells}
          findCellsByStep={findCellsByStep}
          renderCell={renderCell}
          readOnly={false}
          onPrevious={handlePreviousStep}
          onNext={handleNextStep}
          onPreviousPhase={handlePreviousPhase}
          onNextPhase={handleNextPhase}
          isFirstPhase={isFirstPhase}
          isLastPhase={isLastPhase}
        />
      );
    }

    if (viewMode === 'create') {
      return <CreateMode readOnly={false} />;
    }

    // 默认情况下使用 create 模式
    return <CreateMode readOnly={false} />;
  }
};

export default MainContent;