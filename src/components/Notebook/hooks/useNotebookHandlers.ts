// src/components/Notebook/hooks/useNotebookHandlers.ts
// Custom hook for notebook cell and phase handlers

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import useStore from '@Store/notebookStore';
import useOperatorStore from '@Store/operatorStore';
import { findCellsByStep } from '@Utils/markdownParser';
import { useToast } from '../../UI/Toast';
import { notebookLog, uiLog } from '@Utils/logger';
import ImportNotebook4JsonOrJupyter from '@Utils/importFile/import4JsonOrJupyterNotebook';

export const useNotebookHandlers = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    notebookId,
    cells,
    tasks,
    currentPhaseId,
    currentStepIndex,
    currentRunningPhaseId,
    viewMode,
    addCell,
    deleteCell,
    updateCell,
    setLastAddedCellId,
    setError,
    setCurrentPhase,
    setCurrentStepIndex,
    setCurrentCell,
    setEditingCellId,
    setViewMode,
    runAllCells,
  } = useStore();

  const { handleImport, initializeNotebook } = ImportNotebook4JsonOrJupyter();

  // Add cell handler
  const handleAddCell = useCallback(
    async (type: any, index?: number) => {
      try {
        if (!notebookId) {
          await initializeNotebook();
        }

        const newCell = {
          id: uuidv4(),
          type: type,
          content: '',
          outputs: [],
          enableEdit: true,
          phaseId: currentRunningPhaseId || null,
        };

        addCell(newCell, index);
        setLastAddedCellId(newCell.id);

        toast({
          message: t('toast.cellAdded', { type: t(`cellTypes.${type}`) }),
          type: 'success',
        } as any);
      } catch (err) {
        notebookLog.error('Error adding cell', { error: err });
        setError('Failed to add cell. Please try again.');
        toast({
          message: (err as Error).message || t('toast.error'),
          type: 'error',
        } as any);
      }
    },
    [
      initializeNotebook,
      notebookId,
      currentRunningPhaseId,
      addCell,
      setLastAddedCellId,
      setError,
      toast,
      t,
    ]
  );

  // Run all cells handler
  const handleRunAll = useCallback(async () => {
    try {
      await runAllCells();
      toast({
        message: t('toast.allCellsExecuted'),
        type: 'success',
      } as any);
    } catch (err) {
      notebookLog.error('Error running all cells', { error: err });
      setError('Failed to run all cells. Please try again.');
      toast({
        message: (err as Error).message || t('toast.error'),
        type: 'error',
      } as any);
    }
  }, [runAllCells, setError, toast, t]);

  // Phase selection handler
  const handlePhaseSelect = useCallback(
    (phaseId: string, stepId: string) => {
      setCurrentPhase(phaseId);

      const phase = tasks.flatMap((task) => task.phases).find((p) => p.id === phaseId);
      if (phase) {
        const stepIndex = phase.steps.findIndex((s) => s.id === stepId);
        if (stepIndex !== -1) {
          setCurrentStepIndex(stepIndex);

          const stepCells = findCellsByStep(tasks as any, phaseId, stepId, cells as any);
          if (stepCells.length > 0) {
            const firstCellId = stepCells[0].id;
            const cellElement = document.getElementById(`cell-${firstCellId}`);
            if (cellElement) {
              cellElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      }
    },
    [tasks, cells, setCurrentPhase, setCurrentStepIndex]
  );

  // View mode change handler
  const handleModeChange = useCallback(
    (mode: any) => {
      if (mode === 'step' && !currentPhaseId && tasks.length > 0) {
        const firstTask = tasks[0];
        if (firstTask.phases.length > 0) {
          setCurrentPhase(firstTask.phases[0].id);
        }
      }
      setViewMode(mode);
      const operation = {
        type: 'update_view_mode',
        payload: {
          change_to: mode,
          current_phase_id: currentPhaseId,
          current_step_index: currentStepIndex,
        },
      };
      useOperatorStore.getState().sendOperation(notebookId, operation);

      setCurrentCell(null);
      setEditingCellId(null);
    },
    [
      currentPhaseId,
      tasks,
      setCurrentPhase,
      setViewMode,
      notebookId,
      setCurrentCell,
      setEditingCellId,
      currentStepIndex,
    ]
  );

  // Empty state add cell handler
  const handleEmptyStateAddCell = useCallback(
    async (type: 'markdown' | 'code', navigateToWorkspace: (notebookId: string) => void) => {
      try {
        let currentNotebookId = notebookId;

        if (!currentNotebookId) {
          await initializeNotebook();
          currentNotebookId = useStore.getState().notebookId;
        }

        const newCell = {
          id: uuidv4(),
          type: type,
          content: '',
          outputs: [],
          enableEdit: true,
          phaseId: currentRunningPhaseId || null,
        };

        addCell(newCell);
        setLastAddedCellId(newCell.id);

        if (currentNotebookId) {
          uiLog.info('EmptyState: Creating cell and navigating to workspace', {
            notebookId: currentNotebookId,
          });
          navigateToWorkspace(currentNotebookId);
        } else {
          uiLog.error('Failed to get notebook ID after initialization');
        }

        toast({
          message: t('toast.cellAdded', { type: t(`cellTypes.${type}`) }),
          type: 'success',
        } as any);
      } catch (err) {
        uiLog.error('Error adding cell', { error: err });
        setError('Failed to add cell. Please try again.');
        toast({
          message: (err as Error).message || t('toast.error'),
          type: 'error',
        } as any);
      }
    },
    [
      initializeNotebook,
      notebookId,
      currentRunningPhaseId,
      addCell,
      setLastAddedCellId,
      setError,
      toast,
      t,
    ]
  );

  return {
    handleAddCell,
    handleRunAll,
    handlePhaseSelect,
    handleModeChange,
    handleEmptyStateAddCell,
    handleImport,
    deleteCell,
    updateCell,
  };
};
