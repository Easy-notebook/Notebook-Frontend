// src/components/Notebook/components/MainContentArea.tsx
// Main content area without header (header is now in NotebookApp)

import { useMemo, useState, useCallback } from 'react';
import GlobalTabList from '../Display/GlobalTabList';
import ErrorAlert from '../../UI/ErrorAlert';
import CommandInputOrig from '../FunctionBar/AITerminal';
import { useAIAgentStore } from '@Store/AIAgentStore';
import OutlineSidebar from '../LeftSideBar/Main/Workspace/OutlineView/OutlineSidebar';
import KnowledgeForestSidebar from '../LeftSideBar/Main/KnowledgeForest/KnowledgeForestSidebar';
import { EmptySidebar } from '../LeftSideBar/Main/Empty';
import { AgentType } from '@Services/agentMemoryService';
import { Mica } from '@/components/UI/fluent';
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
  routeView = 'workspace',
  viewMode,
  isCollapsed,
  cells,
  isExecuting,
  isRightSidebarCollapsed,
  error,
  children,
  tasks,
  currentPhaseId,
  currentStepId,
  currentStepIndex,
  activeSidebarItem,
  rightSidebarWidth,
  onModeChange,
  onRunAll,
  onExportJson,
  onExportDocx,
  onExportPdf,
  onExportMarkdown,
  onToggleRightSidebar,
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
        return (
          <KnowledgeForestSidebar
            tasks={tasks}
            currentPhaseId={currentPhaseId || ''}
            onPhaseSelect={onPhaseSelect}
          />
        );
      case 'easynet':
        return (
          <div className="p-4">
            <h3 className="text-lg font-medium mb-2">EasyNet</h3>
            <p className="text-gray-500">EasyNet tools coming soon...</p>
          </div>
        );
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
      <div className="flex-1 flex overflow-hidden gap-3 p-3">
        {/* Expanded Sidebar (when not collapsed) */}
        {!isCollapsed && (
          <div className="flex h-full" style={{ width: leftSidebarWidth }}>
            <div className="flex-1 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-xl shadow-lg overflow-hidden">
              <div className="h-full overflow-y-auto scroll-smooth">{renderExpandedSidebar()}</div>
            </div>

            {/* Resize handle */}
            <div
              className="w-1 hover:bg-primary/50 cursor-col-resize transition-colors duration-150 relative group shrink-0 ml-2"
              onMouseDown={handleLeftResize}
              style={{ touchAction: 'none' }}
            >
              <div className="absolute inset-y-0 w-1 rounded-full bg-gray-300/50 dark:bg-gray-700/50 group-hover:bg-primary transition-colors" />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-xl shadow-lg">
          <GlobalTabList />

          <div className="flex-1 overflow-y-auto scroll-smooth w-full h-full">
            <div className="w-full h-full relative z-0">{children}</div>
          </div>

          {error && <ErrorAlert message={error} onClose={() => onSetError(null)} />}
        </div>

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
