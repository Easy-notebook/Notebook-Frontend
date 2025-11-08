// Moved to sections/LeftSidebar/LeftSideBar.tsx
import { useCallback, useEffect } from 'react';
import { MiniSidebar } from './Mini';
import { navigateToHome, navigateToLibrary, navigateToWorkspace } from '@Utils/navigation';
import useSettingsStore from '@Store/settingsStore';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import usePreviewStore from '@Store/previewStore';
import useRouteStore from '@Store/routeStore';

interface LeftSideBarProps {
  tasks: any[];
  currentPhaseId: string | null;
  activeSidebarItem: 'workspace' | 'knowledge-forest' | 'easynet' | 'new-notebook' | 'settings';
  onSidebarItemChange: (itemId: string) => void;
  onSidebarToggle: () => void;
  isMainSidebarExpanded: boolean;
}

const LeftSideBar: React.FC<LeftSideBarProps> = ({
  tasks,
  currentPhaseId,
  activeSidebarItem,
  onSidebarItemChange,
  onSidebarToggle,
  isMainSidebarExpanded,
}: LeftSideBarProps) => {
  // Update CSS variable - always 80px (w-20)
  useEffect(() => {
    const miniWidth = 80; // w-20 = 80px
    document.documentElement.style.setProperty('--nb-mini-sidebar-width', `${miniWidth}px`);
  }, []);

  // Get stores
  const settingsStore = useSettingsStore();
  const { currentView } = useRouteStore();

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
        return activeSidebarItem;
    }
  }, [currentView, settingsStore.settingsOpen, activeSidebarItem]);

  // Handle sidebar item click with navigation
  const handleSidebarItemClick = useCallback(
    async (itemId: string) => {
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
          // Clear current notebook and all related store state
          console.log('🧹 Clearing all notebook state before creating new notebook...');

          // 1. Clear notebook store (saves current notebook first)
          await useStore.getState().setNotebookId(null);

          // 2. Clear preview store (tabs, files, etc.)
          usePreviewStore.getState().clearNotebookState();

          // 3. Clear code store (execution state, kernel state, etc.)
          useCodeStore.getState().resetAll();

          console.log('✅ All notebook state cleared successfully');

          // Navigate to empty state to create new notebook
          navigateToHome();
          break;
        case 'settings':
          settingsStore.openSettings();
          break;
        // easynet doesn't have navigation yet
      }
    },
    [onSidebarItemChange, settingsStore]
  );

  return (
    <MiniSidebar
      phases={tasks?.flatMap((task) => task.phases) || []}
      currentPhaseId={currentPhaseId || undefined}
      onItemClick={handleSidebarItemClick}
      onExpandClick={onSidebarToggle}
      activeItemId={getActiveItemId()}
      isMainSidebarExpanded={isMainSidebarExpanded}
    />
  );
};

export default LeftSideBar;
