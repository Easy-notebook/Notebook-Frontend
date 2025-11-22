/**
 * useNotebookStateSync
 *
 * Hook to automatically sync notebookStore state to workflowStateMachine
 * This ensures the workflow state JSON always has the latest notebook information
 */

import { useEffect, useMemo } from 'react';
import useStore from '@Store/notebookStore';
import { useWorkflowStateMachine } from '../store/workflowStateMachine';
import type { NotebookCell } from '../types/StateJSON';

export function useNotebookStateSync() {
  const notebookId = useStore((state) => state.notebookId);
  const cells = useStore((state) => state.cells);
  const syncNotebookState = useWorkflowStateMachine((state) => state.syncNotebookState);

  // Derive title from first markdown H1 if present
  const derivedTitle = useMemo(() => {
    if (!cells || cells.length === 0) return null;
    const first = cells[0];
    if (first.type === 'markdown' && typeof first.content === 'string') {
      const match = first.content.match(/^#\s*(.+)$/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }, [cells]);

  useEffect(() => {
    console.log('🔄 [useNotebookStateSync] Syncing notebook state:', {
      notebookId,
      cellsCount: cells?.length || 0,
      hasCells: cells && cells.length > 0,
    });

    // Last cell info
    const lastCell = cells.length > 0 ? cells[cells.length - 1] : null;
    const lastCellType = lastCell?.type || null;
    const lastOutput = lastCell?.outputs?.[lastCell.outputs.length - 1] || null;

    // Map frontend Cell -> backend NotebookCell
    const notebookCells: NotebookCell[] = cells.map((cell) => {
      const isCode = cell.type === 'code';
      const nbCell: NotebookCell = {
        id: cell.id,
        type: isCode ? 'code' : 'markdown',
        content: cell.content || '',
        outputs: cell.outputs || [],
        enable_edit: cell.enableEdit !== false,
        description: cell.description || '',
        metadata: cell.metadata || {},
        could_visible_in_writing_mode: true,
        isUpdate: true,
      };

      // Optional fields
      // @ts-expect-error language may be set by code actions
      if (isCode && cell.language) nbCell.language = cell.language as string;
      // @ts-expect-error execution_count might not exist in our Cell type
      if (typeof cell.execution_count === 'number') nbCell.execution_count = cell.execution_count;

      return nbCell;
    });

    // Best-effort execution count
    const executionCount = Math.max(
      0,
      ...cells.map((c: any) => (typeof c.execution_count === 'number' ? c.execution_count : 0))
    );

    // Sync to workflow state machine
    const syncData = {
      notebook_id: notebookId,
      title: derivedTitle,
      cell_count: cells.length,
      last_cell_type: lastCellType,
      last_output: lastOutput,
      cells: notebookCells,
      execution_count: executionCount,
    };

    console.log('🔄 [useNotebookStateSync] Calling syncNotebookState with:', {
      notebook_id: syncData.notebook_id,
      title: syncData.title,
      cell_count: syncData.cell_count,
      cells_length: syncData.cells?.length || 0,
    });

    syncNotebookState(syncData);
  }, [notebookId, cells, syncNotebookState, derivedTitle]);
}
