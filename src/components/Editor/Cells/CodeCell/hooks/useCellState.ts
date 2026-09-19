import { useEffect, useMemo } from 'react';
import useStore from '@Store/notebookStore';
import useCodeStore, { DISPLAY_MODES } from '@Store/codeStore';
import { Cell } from '../utils/types';

/**
 * Hook to manage cell state including execution state, display mode, and detached state
 */
export const useCellState = (cell: Cell, isDemoMode = false) => {
  const isCurrentCell = useStore((state) => state.currentCellId === cell.id);
  const isDetached = useStore((state) => state.detachedCellId === cell.id);
  const isDetachedCellFullscreen = useStore((state) => state.isDetachedCellFullscreen);
  const toggleDetachedCellFullscreen = useStore((state) => state.toggleDetachedCellFullscreen);
  const setDetachedCellId = useStore((state) => state.setDetachedCellId);

  const cellExec = useCodeStore((state) => state.cellExecStates[cell.id]);
  const setCellMode = useCodeStore((state) => state.setCellMode);

  // Cell execution state
  const isExecuting = cellExec?.isExecuting ?? false;
  const isCancelling = cellExec?.isCancelling ?? false;
  const elapsedTime = cellExec?.elapsedTime ?? 0;

  // Cell display mode
  const defaultMode = isDemoMode ? DISPLAY_MODES.OUTPUT_ONLY : DISPLAY_MODES.COMPLETE;
  const cellMode = useCodeStore((state) => state.cellModes[cell.id]) || defaultMode;

  // Detached state

  // Initialize display mode for demo mode
  useEffect(() => {
    if (isDemoMode && !useCodeStore.getState().cellModes[cell.id]) {
      setCellMode(cell.id, DISPLAY_MODES.OUTPUT_ONLY);
    }
  }, [isDemoMode, cell.id, setCellMode]);

  // Check if DSLC command
  const isDslcCommand = useMemo(() => {
    if (!cell.content) return false;
    try {
      const content = typeof cell.content === 'string' ? cell.content : String(cell.content);
      if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
        const cmd = JSON.parse(content.trim());
        return cmd.dslc_command === true;
      }
    } catch {
      return false;
    }
    return false;
  }, [cell.content]);

  // Check if AI Debug button should be shown
  const showAIdebug = useMemo(() => {
    return !!(
      cell.outputs &&
      cell.outputs.length > 0 &&
      cell.outputs[0].content === '[error-message-for-debug]'
    );
  }, [cell.outputs]);

  return {
    isExecuting,
    isCancelling,
    elapsedTime,
    cellMode,
    isDetached,
    isCurrentCell,
    isDslcCommand,
    showAIdebug,
    isDetachedCellFullscreen,
    toggleDetachedCellFullscreen,
    setDetachedCellId,
    setCellMode,
  };
};
