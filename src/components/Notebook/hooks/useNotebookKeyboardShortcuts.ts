// src/components/Notebook/hooks/useNotebookKeyboardShortcuts.ts
// Custom hook for keyboard shortcuts

import { useEffect } from 'react';
import useStore from '@Store/notebookStore';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { uiLog } from '@Utils/logger';
import { isCompositionInput } from '@Editor/utils/compositionInput';
import { getCellIndexById } from '@Store/models/cellIndex';

function canHandleNotebookShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || isCompositionInput(event)) return false;
  const target = event.target;
  return !(
    target instanceof Element &&
    target.closest(
      '.cm-editor, input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], dialog, [role="dialog"]'
    )
  );
}

interface KeyboardShortcutsProps {
  viewMode: string;
  currentStepIndex: number;
  currentPhaseId: string | null;
  handlePreviousStep: () => void;
  handleNextStep: () => void;
  handlePreviousPhase: () => void;
  handleNextPhase: () => void;
  handleModeChange: (mode: any) => void;
  getTotalSteps: () => number;
}

export const useNotebookKeyboardShortcuts = ({
  viewMode,
  currentStepIndex,
  currentPhaseId,
  handlePreviousStep,
  handleNextStep,
  handlePreviousPhase,
  handleNextPhase,
  handleModeChange,
  getTotalSteps,
}: KeyboardShortcutsProps) => {
  const { showCommandInput, setShowCommandInput } = useAIAgentStore();

  // Command input shortcut (Alt/Meta + /)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!canHandleNotebookShortcut(e)) return;
      if ((e.altKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowCommandInput(!showCommandInput);
        uiLog.debug('Command input toggled via keyboard shortcut');
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [showCommandInput, setShowCommandInput]);

  // Navigation and mode toggle shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canHandleNotebookShortcut(e)) return;
      // Alt + Left/Right Arrow for navigation
      if (viewMode === 'step' && e.altKey && !e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStepIndex > 0) {
          handlePreviousStep();
        } else {
          handlePreviousPhase();
        }
      }

      if (viewMode === 'step' && e.altKey && !e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        const totalSteps = getTotalSteps();
        if (currentStepIndex < totalSteps - 1) {
          handleNextStep();
        } else {
          handleNextPhase();
        }
      }

      // Alt + Ctrl to toggle view mode
      if (
        e.altKey &&
        e.ctrlKey &&
        !e.shiftKey &&
        !e.repeat &&
        (e.key === 'Alt' || e.key === 'Control') &&
        !e.getModifierState('AltGraph')
      ) {
        e.preventDefault();
        handleModeChange(viewMode === 'create' ? 'step' : 'create');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    viewMode,
    currentStepIndex,
    handlePreviousStep,
    handleNextStep,
    handlePreviousPhase,
    handleNextPhase,
    getTotalSteps,
    handleModeChange,
    currentPhaseId,
  ]);

  // Create mode arrow navigation
  useEffect(() => {
    const handleArrowNav = (e: KeyboardEvent) => {
      if (!canHandleNotebookShortcut(e)) return;
      if (viewMode !== 'create') return;
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight'
      )
        return;

      const state = useStore.getState();
      const navCells = state.getCurrentViewCells ? state.getCurrentViewCells() : state.cells;
      if (!navCells || navCells.length === 0) return;

      const currentId = state.editingCellId || state.currentCellId || navCells[0]?.id;
      const idx = getCellIndexById(navCells, currentId);
      if (idx === undefined) return;

      e.preventDefault();
      const goPrev = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const newIdx = goPrev ? Math.max(0, idx - 1) : Math.min(navCells.length - 1, idx + 1);
      if (newIdx === idx) return;
      const targetCell = navCells[newIdx];
      if (!targetCell) return;

      if (targetCell.type === 'markdown') {
        state.setEditingCellId(targetCell.id);
      } else {
        state.setEditingCellId(null);
        state.setCurrentCell(targetCell.id);
      }
    };

    window.addEventListener('keydown', handleArrowNav);
    return () => window.removeEventListener('keydown', handleArrowNav);
  }, [viewMode]);
};
