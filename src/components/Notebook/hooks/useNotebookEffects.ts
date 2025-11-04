// src/components/Notebook/hooks/useNotebookEffects.ts
// Custom hook for notebook side effects

import { useEffect } from 'react';
import { StorageManager } from '@Storage/index';
import useStore from '@Store/notebookStore';
import useRouteStore from '@Store/routeStore';
import { useWorkflowControlStore } from '../store/workflowControlStore';
import { uiLog } from '@Utils/logger';

interface NotebookEffectsProps {
  lastAddedCellId: string | null;
  setLastAddedCellId: (id: string | null) => void;
  viewMode: string;
  isExecuting: boolean;
  currentPhaseId: string | null;
  handleNextPhase: () => void;
  routeView: string;
  notebookId: string | null;
  cells: any[];
  navigateToWorkspace: (notebookId: string) => void;
}

export const useNotebookEffects = ({
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
}: NotebookEffectsProps) => {
  const {
    setContinueButtonText,
    setIsGenerating,
    setIsCompleted,
    setOnTerminate,
    setOnContinue,
    setOnCancelCountdown,
  } = useWorkflowControlStore();

  // Initialize storage system on app start
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        uiLog.info('Initializing storage system');
        await StorageManager.initialize();
        uiLog.info('Storage system initialized successfully');
      } catch (error) {
        uiLog.error('Failed to initialize storage system', { error });
      }
    };
    initializeStorage();
  }, []);

  // Scroll to last added cell
  useEffect(() => {
    if (lastAddedCellId) {
      const cellElement = document.getElementById(`cell-${lastAddedCellId}`);
      cellElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setLastAddedCellId(null);
    }
  }, [lastAddedCellId, setLastAddedCellId]);

  // Debug execution state changes
  useEffect(() => {
    uiLog.debug('Execution state changed', { isExecuting });
  }, [isExecuting]);

  // WorkflowControl state management based on view mode
  useEffect(() => {
    uiLog.debug('WorkflowControl state update', {
      viewMode,
      isExecuting,
      currentPhaseId,
    });

    if (viewMode === 'demo' || viewMode === 'create') {
      setContinueButtonText('Continue to Next Stage');
      setOnTerminate(null);
      setOnContinue(null);
      setOnCancelCountdown(null);
    } else {
      uiLog.debug('Setting non-DSLC mode state');
      setContinueButtonText('Continue Workflow');
      setIsGenerating(isExecuting);
      setIsCompleted(!isExecuting);

      setOnTerminate(() => {
        uiLog.debug('Basic terminate handler called');
      });

      setOnContinue(() => {
        uiLog.debug('Basic continue handler called');
        if (viewMode === 'step' && currentPhaseId) {
          handleNextPhase();
        }
      });
    }
  }, [
    viewMode,
    isExecuting,
    currentPhaseId,
    setContinueButtonText,
    setIsGenerating,
    setIsCompleted,
    setOnTerminate,
    setOnContinue,
    setOnCancelCountdown,
    handleNextPhase,
  ]);

  // Auto-navigate to workspace when notebook is created in EmptyState
  useEffect(() => {
    if (routeView === 'empty' && notebookId && cells.length > 0) {
      uiLog.info('EmptyState: Auto-navigating to workspace', {
        notebookId,
        cellCount: cells.length,
      });
      setTimeout(() => {
        navigateToWorkspace(notebookId);
      }, 100);
    }
  }, [routeView, notebookId, cells.length, navigateToWorkspace]);
};
