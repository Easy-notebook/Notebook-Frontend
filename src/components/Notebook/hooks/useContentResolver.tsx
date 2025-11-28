// src/components/Notebook/hooks/useContentResolver.tsx
// Custom hook for resolving which content to display based on route and state

import { useCallback } from 'react';
import { uiLog } from '@Utils/logger';
import { getCurrentAppPath } from '@Utils/routerMode';
import TabbedPreviewApp from '../features/viewers/TabbedPreviewApp';
import { EmptyStatePage, LibraryStatePage, WorkspacePage, LoadingPage } from '../pages';
import DSLCPipeline from '@/components/Scenario/Workflow/Pipeline';

interface ContentResolverProps {
  isShowingFileExplorer: boolean;
  activeFile: any;
  routeView: string;
  cells: any[];
  viewMode: string;
  tasks: any[];
  currentPhaseId: string | null;
  currentStepIndex: number;
  getCurrentViewCells: () => any[];
  handleAddCell: (type: any, index?: number) => Promise<void>;
  handleEmptyStateAddCell: (type: 'markdown' | 'code') => Promise<void>;
  handleLibrarySelectNotebook: (notebookId: string, notebookTitle: string) => Promise<void>;
  handleLibraryBack: () => void;
  renderCell: (cell: any) => JSX.Element | null;
  renderStepNavigation: () => JSX.Element | null;
  handlePreviousStep: () => void;
  handleNextStep: () => void;
  handlePreviousPhase: () => void;
  handleNextPhase: () => void;
  findPhaseIndex: () => { task: any; phaseIndex: number } | null;
}

export const useContentResolver = ({
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
}: ContentResolverProps) => {
  const resolveMainContent = useCallback(() => {
    // Priority 1: File preview (highest priority)
    if (isShowingFileExplorer && activeFile) {
      return { type: 'file-preview', component: <TabbedPreviewApp /> };
    }

    // Priority 2: Based on route view
    switch (routeView) {
      case 'empty':
        uiLog.debug('Content resolution result', { chosen: 'empty-state', reason: 'route-based' });
        return {
          type: 'empty-state',
          component: <EmptyStatePage onAddCell={handleEmptyStateAddCell} />,
        };

      case 'library':
        uiLog.debug('Content resolution result', {
          chosen: 'library-state',
          reason: 'route-based',
        });
        return {
          type: 'library-state',
          component: (
            <LibraryStatePage
              onSelectNotebook={handleLibrarySelectNotebook}
              onBack={handleLibraryBack}
            />
          ),
        };

      case 'pipeline':
        uiLog.debug('Content resolution result', {
          chosen: 'pipeline',
          reason: 'route-based',
        });
        return {
          type: 'pipeline',
          component: <DSLCPipeline onAddCell={handleAddCell} />,
        };

      case 'workspace': {
        const result = findPhaseIndex();
        return {
          type: 'main-content',
          component: (
            <WorkspacePage
              cells={cells}
              viewMode={viewMode}
              tasks={tasks}
              currentPhaseId={currentPhaseId}
              currentStepIndex={currentStepIndex}
              getCurrentViewCells={getCurrentViewCells}
              handleAddCell={handleAddCell}
              renderCell={renderCell}
              renderStepNavigation={renderStepNavigation}
              handlePreviousStep={handlePreviousStep}
              handleNextStep={handleNextStep}
              handlePreviousPhase={handlePreviousPhase}
              handleNextPhase={handleNextPhase}
              isFirstPhase={result ? result.phaseIndex === 0 : false}
              isLastPhase={result ? result.phaseIndex === result.task.phases.length - 1 : false}
            />
          ),
        };
      }

      default: {
        // URL-based fallback
        const currentPath = getCurrentAppPath();
        uiLog.debug('Default route case triggered, checking URL directly', { currentPath });

        if (currentPath === '/') {
          return {
            type: 'empty-state',
            component: <EmptyStatePage onAddCell={handleEmptyStateAddCell} />,
          };
        } else if (currentPath === '/FoKn/Library') {
          return {
            type: 'library-state',
            component: (
              <LibraryStatePage
                onSelectNotebook={handleLibrarySelectNotebook}
                onBack={handleLibraryBack}
              />
            ),
          };
        } else if (currentPath === '/pipeline') {
          return {
            type: 'pipeline',
            component: <DSLCPipeline onAddCell={handleAddCell} />,
          };
        } else if (currentPath.startsWith('/workspace/')) {
          const result = findPhaseIndex();
          return {
            type: 'main-content',
            component: (
              <WorkspacePage
                cells={cells}
                viewMode={viewMode}
                tasks={tasks}
                currentPhaseId={currentPhaseId}
                currentStepIndex={currentStepIndex}
                getCurrentViewCells={getCurrentViewCells}
                handleAddCell={handleAddCell}
                renderCell={renderCell}
                renderStepNavigation={renderStepNavigation}
                handlePreviousStep={handlePreviousStep}
                handleNextStep={handleNextStep}
                handlePreviousPhase={handlePreviousPhase}
                handleNextPhase={handleNextPhase}
                isFirstPhase={result ? result.phaseIndex === 0 : false}
                isLastPhase={result ? result.phaseIndex === result.task.phases.length - 1 : false}
              />
            ),
          };
        } else {
          return {
            type: 'loading',
            component: <LoadingPage embedded={true} />,
          };
        }
      }
    }
  }, [
    isShowingFileExplorer,
    activeFile,
    routeView,
    handleEmptyStateAddCell,
    handleLibrarySelectNotebook,
    handleLibraryBack,
    cells,
    viewMode,
    tasks,
    currentPhaseId,
    currentStepIndex,
    getCurrentViewCells,
    handleAddCell,
    renderCell,
    renderStepNavigation,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
    findPhaseIndex,
  ]);

  return { resolveMainContent };
};
