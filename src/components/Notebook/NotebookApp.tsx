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
import { LeftSideBar } from '@LeftSidebar';
import StepNavigation from './features/workflow/StepNavigation';

// Custom hooks
import {
  useNotebookHandlers,
  useNotebookNavigation,
  useNotebookExport,
  useNotebookKeyboardShortcuts,
  useCellRenderer,
  useContentResolver,
  useNotebookEffects,
  useLibraryHandlers,
} from './hooks';

// UI Components
import { MainContentArea } from './components';
import { WorkspaceHeader, EmptyStateHeader } from './ui/layout/headers';
import { useRef } from 'react';

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
  const [, setCurrentView] = useState<'notebook' | 'agent'>('notebook');
  const [, setSelectedAgentType] = useState<AgentType | null>(null);

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
    const next = !isCollapsed;
    setIsCollapsed(next);
    // In create mode: expanding left collapses right
    if (viewMode === 'create' && next === false) {
      setIsRightSidebarCollapsed(true);
    }
  }, [isCollapsed, setIsCollapsed, setIsRightSidebarCollapsed, viewMode]);

  const handleRightSidebarToggle = useCallback(() => {
    const next = !isRightSidebarCollapsed;
    setIsRightSidebarCollapsed(next);
    // In create mode: expanding right collapses left
    if (viewMode === 'create' && next === false) {
      setIsCollapsed(true);
    }
  }, [isRightSidebarCollapsed, setIsRightSidebarCollapsed, setIsCollapsed, viewMode]);

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Render header based on route view
  const renderHeader = () => {
    switch (routeView) {
      case 'empty':
        return (
          <EmptyStateHeader
            onTriggerFileInput={triggerFileInput}
            onHandleImport={handleImport}
            onOpenSettings={settingstore.openSettings}
            fileInputRef={fileInputRef}
            onToggleRightSidebar={handleRightSidebarToggle}
          />
        );
      case 'library':
        return null;
      case 'workspace':
      default:
        return (
          <WorkspaceHeader
            viewMode={viewMode}
            isCollapsed={isCollapsed}
            cells={cells}
            isExecuting={isExecuting}
            isRightSidebarCollapsed={isRightSidebarCollapsed}
            onModeChange={handleModeChange}
            onRunAll={handleRunAll}
            onExportJson={handleExportJson}
            onExportDocx={exportDocx}
            onExportPdf={exportPdf}
            onExportMarkdown={exportMarkdown}
            onTriggerFileInput={triggerFileInput}
            onHandleImport={handleImport}
            onShowCommandInput={() => {}}
            onToggleRightSidebar={handleRightSidebarToggle}
            onOpenSettings={settingstore.openSettings}
            fileInputRef={fileInputRef}
          />
        );
    }
  };

  return (
    <div className="h-screen overflow-hidden relative text-foreground transition-colors duration-300">
      <SettingsPage />

      {/* Global background layers now live at App level */}

      {/* Content Layer on top of background */}
      <div className="relative z-10 h-screen flex">
        {/* Left: MiniSidebar (80px wide, full height) */}
        <div className="w-20 shrink-0">
          <LeftSideBar
            tasks={tasks}
            currentPhaseId={currentPhaseId}
            activeSidebarItem={activeSidebarItem}
            onSidebarItemChange={handleSidebarItemChange}
            onSidebarToggle={handleSidebarToggle}
            isMainSidebarExpanded={!isCollapsed}
          />
        </div>

        {/* Right: Header + MainContainer */}
        <div className="flex-1 flex flex-col">
          {/* Top: Header (56px height) */}
          <div className="h-14 shrink-0">{renderHeader()}</div>

          {/* Bottom: Main Content */}
          <main className="flex-1 min-h-0">
            <div className="h-full flex flex-col">
              <MainContentArea
                routeView={routeView}
                viewMode={viewMode}
                isCollapsed={isCollapsed}
                cells={cells}
                isExecuting={isExecuting}
                isRightSidebarCollapsed={isRightSidebarCollapsed}
                error={error}
                tasks={tasks}
                currentPhaseId={currentPhaseId}
                currentStepId={
                  currentStepIndex !== null
                    ? (tasks.flatMap((task) => task.phases).find((p) => p.id === currentPhaseId)
                        ?.steps[currentStepIndex]?.id ?? null)
                    : null
                }
                currentStepIndex={currentStepIndex}
                activeSidebarItem={activeSidebarItem}
                onModeChange={handleModeChange}
                onRunAll={handleRunAll}
                onExportJson={handleExportJson}
                onExportDocx={exportDocx}
                onExportPdf={exportPdf}
                onExportMarkdown={exportMarkdown}
                onToggleRightSidebar={handleRightSidebarToggle}
                onSetError={setError}
                onPhaseSelect={handlePhaseSelect}
                onAgentSelect={handleAgentSelect}
              >
                {resolveMainContent().component}
              </MainContentArea>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default memo(NotebookApp);
