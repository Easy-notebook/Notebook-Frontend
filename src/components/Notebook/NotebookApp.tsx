// src/components/Notebook/NotebookApp.tsx
// Refactored main NotebookApp component - thin orchestrator

import { memo, useState, useCallback } from 'react';
import useStore from '@Store/notebookStore';
import useRouteStore from '@Store/routeStore';
import usePreviewStore from '@Store/previewStore';
import useSettingsStore from '@Store/settingsStore';
import { useRouteSync } from '@Hooks/useRouteSync';
import { AgentType } from '@Services/agentMemoryService';
import SettingsPage from '../Scenario/settingState';
import { LeftSideBar } from './LeftSideBar';
import WorkflowControl from './MainContainer/WorkflowControl';
import StepNavigation from './MainContainer/StepNavigation';

// Custom hooks
import {
  useNotebookHandlers,
  useNotebookNavigation,
  useNotebookExport,
  useNotebookKeyboardShortcuts,
  useRightSidebarResize,
  useCellRenderer,
  useContentResolver,
  useNotebookEffects,
  useLibraryHandlers,
} from './hooks';

// UI Components
import { RightSidebar, MainContentArea } from './components';

// Main NotebookApp component
const NotebookApp = () => {
  // Route state
  const routeStore = useRouteStore();
  const routeView = routeStore.currentView;
  const { navigateToWorkspace, navigateToEmpty } = routeStore;
  useRouteSync();

  // Settings store
  const settingstore = useSettingsStore();

  // Local state
  const [activeSidebarItem, setActiveSidebarItem] = useState<
    'workspace' | 'knowledge-forest' | 'easynet' | 'new-notebook' | 'settings'
  >('workspace');
  const [currentView, setCurrentView] = useState<'notebook' | 'agent'>('notebook');
  const [selectedAgentType, setSelectedAgentType] = useState<AgentType | null>(null);

  // Notebook store state
  const {
    notebookId,
    cells,
    tasks,
    viewMode,
    currentPhaseId,
    currentStepIndex,
    getCurrentViewCells,
    getTotalSteps,
    isExecuting,
    currentRunningPhaseId,
    allowPagination,
    error,
    isCollapsed,
    lastAddedCellId,
    uploadMode,
    allowedTypes,
    maxFiles,
    isRightSidebarCollapsed,
    setError,
    setLastAddedCellId,
    setIsRightSidebarCollapsed,
    setIsCollapsed,
  } = useStore();

  // Preview store
  const isShowingFileExplorer = usePreviewStore((state) => state.previewMode === 'file');
  const { activeFile } = usePreviewStore();

  // Custom hooks for business logic
  const {
    handleAddCell,
    handleRunAll,
    handlePhaseSelect,
    handleModeChange,
    handleEmptyStateAddCell: baseHandleEmptyStateAddCell,
    handleImport,
    deleteCell,
    updateCell,
  } = useNotebookHandlers();

  const {
    findPhaseIndex,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
  } = useNotebookNavigation();

  const { handleExportJson, exportDocx, exportPdf, exportMarkdown } = useNotebookExport();

  const { rightSidebarWidth, handleRightResize } = useRightSidebarResize();

  const { renderCell } = useCellRenderer({
    viewMode,
    uploadMode,
    allowedTypes,
    maxFiles,
    deleteCell,
    updateCell,
  });

  const {
    handleLibrarySelectNotebook: baseHandleLibrarySelectNotebook,
    handleLibraryBack: baseHandleLibraryBack,
  } = useLibraryHandlers();

  // Wrapper handlers that include navigation
  const handleEmptyStateAddCell = useCallback(
    (type: 'markdown' | 'code') => baseHandleEmptyStateAddCell(type, navigateToWorkspace),
    [baseHandleEmptyStateAddCell, navigateToWorkspace]
  );

  const handleLibrarySelectNotebook = useCallback(
    (notebookId: string, notebookTitle: string) =>
      baseHandleLibrarySelectNotebook(notebookId, notebookTitle, navigateToWorkspace),
    [baseHandleLibrarySelectNotebook, navigateToWorkspace]
  );

  const handleLibraryBack = useCallback(
    () => baseHandleLibraryBack(navigateToEmpty),
    [baseHandleLibraryBack, navigateToEmpty]
  );

  // Render step navigation
  const renderStepNavigation = useCallback(() => {
    const result = findPhaseIndex();
    if (!result) return null;

    const { task, phaseIndex } = result;
    const currentPhase = task.phases[phaseIndex];
    const isFirstPhase = phaseIndex === 0;
    const isLastPhase = phaseIndex === task.phases.length - 1;

    return (
      <StepNavigation
        currentPhase={currentPhase}
        currentStepIndex={currentStepIndex}
        totalSteps={getTotalSteps()}
        onPrevious={handlePreviousStep}
        onNext={handleNextStep}
        onPreviousPhase={handlePreviousPhase}
        onNextPhase={handleNextPhase}
        isFirstPhase={isFirstPhase}
        isLastPhase={isLastPhase}
      />
    );
  }, [
    findPhaseIndex,
    currentStepIndex,
    getTotalSteps,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
  ]);

  // Content resolver
  const { resolveMainContent } = useContentResolver({
    isShowingFileExplorer,
    activeFile,
    routeView,
    cells,
    viewMode,
    tasks,
    currentPhaseId,
    currentStepIndex,
    getCurrentViewCells,
    handleAddCell,
    handleEmptyStateAddCell,
    handleLibrarySelectNotebook,
    handleLibraryBack,
    renderCell,
    renderStepNavigation,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
    findPhaseIndex,
  });

  // Keyboard shortcuts
  useNotebookKeyboardShortcuts({
    viewMode,
    currentStepIndex,
    currentPhaseId,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
    handleModeChange,
    getTotalSteps,
  });

  // Side effects
  useNotebookEffects({
    lastAddedCellId,
    setLastAddedCellId,
    viewMode,
    isExecuting,
    currentPhaseId,
    handleNextPhase,
    routeView,
    notebookId,
    cells,
    navigateToWorkspace,
  });

  // Sidebar handlers
  const handleAgentSelect = useCallback((agentType: AgentType) => {
    setSelectedAgentType(agentType);
    setCurrentView('agent');
  }, []);

  const handleSidebarItemChange = useCallback(
    (itemId: string) => {
      setActiveSidebarItem(itemId as any);
      if (isCollapsed) {
        setIsCollapsed(false);
      }
    },
    [isCollapsed, setIsCollapsed]
  );

  const handleSidebarToggle = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, setIsCollapsed]);

  return (
    <div className="h-screen flex border-r border-black">
      <SettingsPage />

      {/* Left Sidebar */}
      <LeftSideBar
        tasks={tasks}
        currentPhaseId={currentPhaseId}
        currentStepId={
          currentStepIndex !== null
            ? (tasks.flatMap((task) => task.phases).find((p) => p.id === currentPhaseId)?.steps[
                currentStepIndex
              ]?.id ?? null)
            : null
        }
        isCollapsed={isCollapsed}
        activeSidebarItem={activeSidebarItem}
        onPhaseSelect={handlePhaseSelect}
        onAgentSelect={handleAgentSelect}
        onSidebarItemChange={handleSidebarItemChange}
        onSidebarToggle={handleSidebarToggle}
        viewMode={viewMode}
        currentRunningPhaseId={currentRunningPhaseId}
        allowPagination={allowPagination}
      />

      {/* Main Content Area */}
      <MainContentArea
        viewMode={viewMode}
        isCollapsed={isCollapsed}
        cells={cells}
        isExecuting={isExecuting}
        isRightSidebarCollapsed={isRightSidebarCollapsed}
        error={error}
        onModeChange={handleModeChange}
        onRunAll={handleRunAll}
        onExportJson={handleExportJson}
        onExportDocx={exportDocx}
        onExportPdf={exportPdf}
        onExportMarkdown={exportMarkdown}
        onHandleImport={handleImport}
        onToggleRightSidebar={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
        onOpenSettings={settingstore.openSettings}
        onSetError={setError}
      >
        {resolveMainContent().component}
      </MainContentArea>

      {/* Right Sidebar */}
      <RightSidebar
        isCollapsed={isRightSidebarCollapsed}
        width={rightSidebarWidth}
        viewMode={viewMode}
        currentPhaseId={currentPhaseId}
        currentStepIndex={currentStepIndex}
        onResize={handleRightResize}
      />

      {/* Workflow Control */}
      <WorkflowControl fallbackViewMode={viewMode} />
    </div>
  );
};

export default memo(NotebookApp);
