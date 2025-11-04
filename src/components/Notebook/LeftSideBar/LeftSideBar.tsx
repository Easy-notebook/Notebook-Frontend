import { useState, useCallback } from 'react';
import OutlineSidebar from './Main/Workspace/OutlineView/OutlineSidebar';
import KnowledgeForestSidebar from './Main/KnowledgeForest/KnowledgeForestSidebar';
import { EmptySidebar } from './Main/Empty';
import { MiniSidebar } from './Mini';
import { AgentType } from '@Services/agentMemoryService';
import { navigateToHome, navigateToLibrary, navigateToWorkspace } from '@Utils/navigation';
import useSettingsStore from '@Store/settingsStore';
import useStore from '@Store/notebookStore';
import useRouteStore from '@Store/routeStore';

interface LeftSideBarProps {
  tasks: any[];
  currentPhaseId: string | null;
  currentStepId: string | null;
  isCollapsed: boolean;
  activeSidebarItem: 'workspace' | 'knowledge-forest' | 'easynet' | 'new-notebook' | 'settings';
  onPhaseSelect: (phaseId: string, stepId: string) => void;
  onAgentSelect: (agentType: AgentType) => void;
  onSidebarItemChange: (itemId: string) => void;
  onSidebarToggle: () => void;
  viewMode: string;
  currentRunningPhaseId: string | null;
  allowPagination: boolean;
}

const LeftSideBar: React.FC<LeftSideBarProps> = ({
  tasks,
  currentPhaseId,
  currentStepId,
  isCollapsed,
  activeSidebarItem,
  onPhaseSelect,
  onAgentSelect,
  onSidebarItemChange,
  onSidebarToggle,
  viewMode,
}: LeftSideBarProps) => {
  // Left sidebar width state management
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('leftSidebarWidth');
    return saved ? parseInt(saved) : 384; // w-96 = 384px
  });

  // Optimized resize handler
  const handleLeftResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
  }, [leftSidebarWidth]);

  // Get stores
  const settingsStore = useSettingsStore();
  const { currentRoute, currentView } = useRouteStore();

  // Calculate active sidebar item based on current route
  const getActiveItemId = useCallback(() => {
    if (settingsStore.settingsOpen) {
      return 'settings';
    }
    
    switch (currentView) {
      case 'empty':
        return 'new-notebook';
      case 'library':
        return 'knowledge-forest';
      case 'workspace':
        return 'workspace';
      default:
        // Fallback to route-based detection
        if (currentRoute === '/') {
          return 'new-notebook';
        } else if (currentRoute === '/FoKn/Library') {
          return 'knowledge-forest';
        } else if (currentRoute.startsWith('/workspace/')) {
          return 'workspace';
        }
        return activeSidebarItem; // Use prop as fallback
    }
  }, [currentView, currentRoute, settingsStore.settingsOpen, activeSidebarItem]);

  // Handle sidebar item click with navigation
  const handleSidebarItemClick = useCallback((itemId: string) => {
    onSidebarItemChange(itemId);
    
    // Handle navigation based on item
    switch (itemId) {
      case 'workspace':
        navigateToWorkspace(useStore.getState().notebookId || '');
        break;
      case 'knowledge-forest':
        navigateToLibrary();
        break;
      case 'new-notebook':
        // Clear current notebook and navigate to empty state
        useStore.getState().setNotebookId(null);
        navigateToHome();
        break;
      case 'settings':
        settingsStore.openSettings();
        break;
      // easynet doesn't have navigation yet
    }
  }, [onSidebarItemChange, settingsStore]);

  // Helper function to render main content based on current route
  const renderMainContent = useCallback(() => {
    if (isCollapsed) return null;
    
    const activeItem = getActiveItemId();
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
        // When on EmptyState (/), show notebook history
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
    getActiveItemId,
    tasks,
    currentPhaseId,
    currentStepId,
    onPhaseSelect,
    onAgentSelect,
    viewMode
  ]);
  

  return (
    <div className="flex">
      {/* Mini sidebar (always visible) */}
      <div className="shrink-0">
        <MiniSidebar
          phases={tasks?.flatMap(task => task.phases) || []}
          currentPhaseId={currentPhaseId || undefined}
          onPhaseClick={(phaseId) => {
            if (phaseId === null) {
              onSidebarToggle();
              return;
            }
            const allPhases = tasks?.flatMap(task => task.phases) || [];
            const phase = allPhases.find(p => p.id === phaseId);
            if (phase && phase.steps.length > 0) {
              onPhaseSelect(phaseId, phase.steps[0].id);
            }
          }}
          onItemClick={handleSidebarItemClick}
          onExpandClick={onSidebarToggle}
          activeItemId={getActiveItemId()}
          isMainSidebarExpanded={!isCollapsed}
        />
      </div>
      
      {/* Main sidebar content (when expanded) */}
      {!isCollapsed && (
        <>
          <div
            className="transition-all duration-500 ease-in-out relative bg-white"
            style={{ width: `${leftSidebarWidth - 64}px` }}
          >
            {renderMainContent()}
          </div>
          <div
            className="w-px bg-gray-300 hover:bg-thme-500 cursor-col-resize transition-colors duration-150 relative group"
            onMouseDown={handleLeftResize}
          >
            <div className="absolute inset-y-0 w-1 -translate-x-0.5 group-hover:bg-theme-100/50" />
          </div>
        </>
      )}
    </div>
  );
};

export default LeftSideBar;