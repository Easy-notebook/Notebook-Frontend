// src/components/Notebook/components/MainContentArea.tsx
// Main content area without header (header is now in NotebookApp)

import { useCallback } from 'react';
import GlobalTabList from '../features/tabs/GlobalTabList';
import ErrorAlert from '../../UI/ErrorAlert';
import CommandInput from '../features/function-bar/AITerminal';
import OutlineSidebar from '@LeftSidebar/Main/Workspace/OutlineView/OutlineSidebar';
import { EmptySidebar } from '@LeftSidebar/Main/Empty';
import { AgentType } from '@Services/agentMemoryService';
import { ThreePanelLayout } from './ThreePanelLayout';
import { RightSidebar } from './RightSidebar';
import WorkflowControl from '../features/workflow/WorkflowControl';
import WorkflowPanel from '../features/workflow/WorkflowPanel';
import DetachedCellView from '../features/workflow/DetachedCellView';
import useStore from '@Store/notebookStore';
import type { Cell } from '@Store/models';
import type { Task } from '@Store/models';

interface MainContentAreaProps {
  routeView?: string; // Current route view: 'workspace', 'empty', 'library'
  viewMode: string;
  isCollapsed: boolean;
  cells: Cell[];
  isExecuting: boolean;
  isRightSidebarCollapsed: boolean;
  error: string | null;
  children: React.ReactNode;
  tasks: Task[];
  currentPhaseId: string | null;
  currentStepId: string | null;
  currentStepIndex: number;
  activeSidebarItem: 'workspace' | 'knowledge-forest' | 'easynet' | 'new-notebook' | 'settings';
  onModeChange: (mode: string) => void;
  onRunAll: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  onToggleRightSidebar: () => void;
  onSetError: (error: string | null) => void;
  onPhaseSelect: (phaseId: string, stepId: string) => void;
  onAgentSelect: (agentType: AgentType) => void;
}

export const MainContentArea = ({
  viewMode,
  isCollapsed,
  isRightSidebarCollapsed,
  error,
  children,
  tasks,
  currentPhaseId,
  currentStepId,
  currentStepIndex,
  activeSidebarItem,
  onSetError,
  onPhaseSelect,
  onAgentSelect,
}: MainContentAreaProps) => {
  // Check if there's a detached cell to display
  const { detachedCellId, setDetachedCellId } = useStore();
  // Helper function to check if sidebar has content
  const hasSidebarContent = useCallback(() => {
    const activeItem = activeSidebarItem;
    switch (activeItem) {
      case 'workspace':
        // Workspace has content if there are tasks
        return tasks && tasks.length > 0;
      case 'knowledge-forest':
      case 'easynet':
      case 'settings':
        // These views don't have content to display
        return false;
      case 'new-notebook':
        // Only new-notebook always has content
        return true;
      default:
        return false;
    }
  }, [activeSidebarItem, tasks]);

  // Helper function to render expanded sidebar content
  const renderExpandedSidebar = useCallback(() => {
    if (isCollapsed) return null;

    const activeItem = activeSidebarItem;
    switch (activeItem) {
      case 'workspace':
        return (
          <OutlineSidebar
            tasks={tasks}
            currentPhaseId={currentPhaseId || ''}
            currentStepId={currentStepId || ''}
            onPhaseSelect={onPhaseSelect}
            onAgentSelect={onAgentSelect}
            viewMode={viewMode}
          />
        );
      case 'knowledge-forest':
        return null;
      case 'easynet':
        return null;
      case 'new-notebook':
        return <EmptySidebar />;
      default:
        return null;
    }
  }, [
    isCollapsed,
    activeSidebarItem,
    tasks,
    currentPhaseId,
    currentStepId,
    onPhaseSelect,
    onAgentSelect,
    viewMode,
  ]);

  // Create panel content
  const leftPanelContent = renderExpandedSidebar();

  const centerPanelContent = (
    <div className="h-full w-full flex flex-col relative">
      <GlobalTabList />

      {/* Workflow Panel - shows current workflow progress */}
      <WorkflowPanel />

      <div className="flex-1 overflow-y-scroll scroll-smooth w-full min-h-0">
        <div className="w-full h-full relative z-0">{children}</div>
      </div>
      {error && <ErrorAlert message={error} onClose={() => onSetError(null)} />}

      {/* Workflow Control - fixed in editor area bottom-right */}
      <WorkflowControl fallbackViewMode={viewMode} />

      {/* AI Command Input - in editor area */}
      <CommandInput />
    </div>
  );

  const rightPanelContent = (
    <RightSidebar
      viewMode={viewMode}
      currentPhaseId={currentPhaseId}
      currentStepIndex={currentStepIndex}
    />
  );

  // Determine panel visibility
  const showLeft = !isCollapsed && hasSidebarContent();
  const showRight = !isRightSidebarCollapsed;

  return (
    <>
      {/* Detached Cell Fullscreen View - shown on top of everything */}
      {detachedCellId && (
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 flex flex-col">
          {/* Close button */}
          <div className="h-14 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Cell Fullscreen View
            </h2>
            <button
              onClick={() => setDetachedCellId(null)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>

          {/* Detached cell content */}
          <div className="flex-1 overflow-y-auto p-6">
            <DetachedCellView />
          </div>
        </div>
      )}

      {/* Content area using ThreePanelLayout */}
      <div className="flex-1 flex gap-1.5 p-3 min-h-0">
        <ThreePanelLayout
          showLeft={showLeft}
          showRight={showRight}
          leftPanel={leftPanelContent}
          centerPanel={centerPanelContent}
          rightPanel={rightPanelContent}
          leftMinSize={15}
          leftMaxSize={50}
          leftDefaultSize={25}
          rightMinSize={20}
          rightMaxSize={50}
          rightDefaultSize={25}
          centerMinSize={30}
          storageKey="main-content-area-layout"
          wrapPanelsInCard={true}
          centerOverflowHidden={false}
        />
      </div>
    </>
  );
};
