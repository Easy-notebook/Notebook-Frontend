// src/components/Notebook/components/MainContentArea.tsx
// Main content area without header (header is now in NotebookApp)

import { useState, useCallback } from 'react';
import GlobalTabList from '../Display/GlobalTabList';
import ErrorAlert from '../../UI/ErrorAlert';
import CommandInputOrig from '../FunctionBar/AITerminal';
import { useAIAgentStore } from '@Store/AIAgentStore';
import OutlineSidebar from '../LeftSideBar/Main/Workspace/OutlineView/OutlineSidebar';
import { EmptySidebar } from '../LeftSideBar/Main/Empty';
import { AgentType } from '@Services/agentMemoryService';
import { Card } from '@/components/UI/card';
import { RightSidebar } from './RightSidebar';

// Cast component to any to relax prop type constraints
const CommandInput: any = CommandInputOrig;

interface MainContentAreaProps {
  routeView?: string; // Current route view: 'workspace', 'empty', 'library'
  viewMode: string;
  isCollapsed: boolean;
  cells: any[];
  isExecuting: boolean;
  isRightSidebarCollapsed: boolean;
  error: string | null;
  children: React.ReactNode;
  tasks: any[];
  currentPhaseId: string | null;
  currentStepId: string | null;
  currentStepIndex: number;
  activeSidebarItem: 'workspace' | 'knowledge-forest' | 'easynet' | 'new-notebook' | 'settings';
  rightSidebarWidth: number;
  onModeChange: (mode: any) => void;
  onRunAll: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  onToggleRightSidebar: () => void;
  onSetError: (error: string | null) => void;
  onPhaseSelect: (phaseId: string, stepId: string) => void;
  onAgentSelect: (agentType: AgentType) => void;
  onRightResize: (e: React.MouseEvent<HTMLDivElement>) => void;
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
  rightSidebarWidth,
  onSetError,
  onPhaseSelect,
  onAgentSelect,
  onRightResize,
}: MainContentAreaProps) => {
  const { setShowCommandInput } = useAIAgentStore();

  // Left sidebar width state management
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('leftSidebarWidth');
    return saved ? parseInt(saved) : 384; // w-96 = 384px
  });

  // Optimized resize handler
  const handleLeftResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = leftSidebarWidth;
      let animationId: number | null = null;

      const handleMouseMove = (e: MouseEvent) => {
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(() => {
          const newWidth = Math.max(200, Math.min(800, startWidth + e.clientX - startX));
          setLeftSidebarWidth(newWidth);
        });
      };

      const handleMouseUp = () => {
        if (animationId) cancelAnimationFrame(animationId);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        // Save the current width state
        requestAnimationFrame(() => {
          localStorage.setItem('leftSidebarWidth', leftSidebarWidth.toString());
        });
      };

      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [leftSidebarWidth]
  );

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
      case 'settings':
        return (
          <div className="p-4">
            <h3 className="text-lg font-medium mb-2">Settings</h3>
            <p className="text-gray-500">Settings panel...</p>
          </div>
        );
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

  // Header is now rendered in NotebookApp

  return (
    <>
      <CommandInput onClick={() => setShowCommandInput(true)} />

      {/* Content area - no header here anymore */}
      <div className="flex-1 flex overflow-hidden gap-1.5 p-3">
        {/* Expanded Sidebar (when not collapsed and has content) */}
        {!isCollapsed && hasSidebarContent() && (
          <div className="flex h-full" style={{ width: leftSidebarWidth }}>
            <Card className="flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto scroll-smooth">{renderExpandedSidebar()}</div>
            </Card>

            {/* Resize handle */}
            <div
              className="w-1 cursor-col-resize transition-all duration-150 relative group shrink-0 ml-2"
              onMouseDown={handleLeftResize}
              style={{ touchAction: 'none' }}
            >
              <div className="absolute inset-y-0 w-1 rounded-full bg-transparent group-hover:bg-primary transition-all opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        )}

        {/* Main Content */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <GlobalTabList />

          <div className="flex-1 overflow-y-auto scroll-smooth w-full h-full">
            <div className="w-full h-full relative z-0">{children}</div>
          </div>

          {error && <ErrorAlert message={error} onClose={() => onSetError(null)} />}
        </Card>

        {/* Right Sidebar */}
        <RightSidebar
          isCollapsed={isRightSidebarCollapsed}
          width={rightSidebarWidth}
          viewMode={viewMode}
          currentPhaseId={currentPhaseId}
          currentStepIndex={currentStepIndex}
          onResize={onRightResize}
        />
      </div>
    </>
  );
};
