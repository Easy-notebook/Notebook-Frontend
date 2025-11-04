// src/components/Notebook/hooks/useNotebookNavigation.ts
// Custom hook for notebook navigation (step/phase navigation)

import { useCallback } from 'react';
import useStore from '@Store/notebookStore';

export const useNotebookNavigation = () => {
  const {
    tasks,
    currentPhaseId,
    currentStepIndex,
    getTotalSteps,
    setCurrentPhase,
    setCurrentStepIndex,
  } = useStore();

  // Helper function to find phase index
  const findPhaseIndex = useCallback(() => {
    for (const task of tasks) {
      const phaseIndex = task.phases.findIndex((p) => p.id === currentPhaseId);
      if (phaseIndex !== -1) {
        return { task, phaseIndex };
      }
    }
    return null;
  }, [tasks, currentPhaseId]);

  // Navigation handlers
  const handlePreviousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }, [currentStepIndex, setCurrentStepIndex]);

  const handleNextStep = useCallback(() => {
    const totalSteps = getTotalSteps();
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [currentStepIndex, getTotalSteps, setCurrentStepIndex]);

  const handlePreviousPhase = useCallback(() => {
    const result = findPhaseIndex();
    if (result) {
      const { task, phaseIndex } = result;
      if (phaseIndex > 0) {
        const previousPhase = task.phases[phaseIndex - 1];
        setCurrentPhase(previousPhase.id);
        setCurrentStepIndex(0);
      }
    }
  }, [findPhaseIndex, setCurrentPhase, setCurrentStepIndex]);

  const handleNextPhase = useCallback(() => {
    const result = findPhaseIndex();
    if (result) {
      const { task, phaseIndex } = result;
      if (phaseIndex < task.phases.length - 1) {
        const nextPhase = task.phases[phaseIndex + 1];
        setCurrentPhase(nextPhase.id);
        setCurrentStepIndex(0);
      }
    }
  }, [findPhaseIndex, setCurrentPhase, setCurrentStepIndex]);

  return {
    findPhaseIndex,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
  };
};
