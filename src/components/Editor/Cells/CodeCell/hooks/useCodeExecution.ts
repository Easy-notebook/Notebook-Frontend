import { useCallback, useEffect } from 'react';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { Cell } from '../utils/types';

/**
 * Hook to handle code execution logic including execute, cancel, and DSLC commands
 */
export const useCodeExecution = (cell: Cell, dslcMode: boolean, isDslcCommand: boolean) => {
  const { updateCell, clearCellOutputs } = useStore();
  const executeCell = useCodeStore((state) => state.executeCell);
  const cancelCellExecution = useCodeStore((state) => state.cancelCellExecution);

  // Execute cell
  const handleExecute = useCallback(() => {
    executeCell(cell.id);
  }, [cell.id, executeCell]);

  // Cancel execution
  const handleCancel = useCallback(() => {
    cancelCellExecution(cell.id);
  }, [cell.id, cancelCellExecution]);

  // Clear cell outputs
  const handleClearOutput = useCallback(() => {
    clearCellOutputs(cell.id);
  }, [cell.id, clearCellOutputs]);

  // Update cell content
  const handleChange = useCallback(
    (value: string) => {
      updateCell(cell.id, value);
    },
    [cell.id, updateCell]
  );

  // Execute DSLC commands
  useEffect(() => {
    if (isDslcCommand && dslcMode && cell.content) {
      try {
        const cmd = JSON.parse(cell.content);
        if (cmd.action === 'execute' && cmd.code) {
          // Update cell code content
          updateCell(cell.id, cmd.code);
          // Delay execution to ensure content is updated
          setTimeout(() => {
            executeCell(cell.id);
          }, 100);
        }
      } catch (e) {
        console.error('DSLC command parsing error:', e);
      }
    }
  }, [isDslcCommand, dslcMode, cell.id, cell.content, updateCell, executeCell]);

  // Restart kernel
  const handleRestart = useCallback(() => {
    console.log(`Initializing kernel for cell ${cell.id}`);
    useStore.getState().clearAllOutputs();
    useCodeStore.getState().restartKernel();
  }, [cell.id]);

  // Copy code to clipboard
  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(cell.content || '').then(
      () => {
        // Silent copy
      },
      (err) => {
        if (import.meta.env.DEV) {
          console.error('Copy failed:', err);
        }
      }
    );
  }, [cell.content]);

  return {
    handleExecute,
    handleCancel,
    handleClearOutput,
    handleChange,
    handleRestart,
    handleCopyCode,
  };
};
