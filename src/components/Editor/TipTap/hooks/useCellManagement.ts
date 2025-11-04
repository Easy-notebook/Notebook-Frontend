/**
 * Cell Management Hook
 * Handles adding different types of cells to the notebook
 */

import { useCallback } from 'react';
import { Cell } from '@Store/notebookStore';
import { generateCellId } from '@Editor/utils/cellConverters';

interface UseCellManagementProps {
  cells: Cell[];
  setCells: (cells: Cell[]) => void;
}

export function useCellManagement({ cells, setCells }: UseCellManagementProps) {
  const addCodeCell = useCallback(() => {
    const newCell: Cell = {
      id: generateCellId(),
      type: 'code',
      content: '',
      outputs: [],
      enableEdit: true,
    };
    setCells([...cells, newCell]);
    return newCell.id;
  }, [cells, setCells]);

  const addMarkdownCell = useCallback(() => {
    const newCell: Cell = {
      id: generateCellId(),
      type: 'markdown',
      content: '',
      outputs: [],
      enableEdit: true,
    };
    setCells([...cells, newCell]);
    return newCell.id;
  }, [cells, setCells]);

  const addHybridCell = useCallback(() => {
    const newCell: Cell = {
      id: generateCellId(),
      type: 'hybrid',
      content: '',
      outputs: [],
      enableEdit: true,
    };
    setCells([...cells, newCell]);
    return newCell.id;
  }, [cells, setCells]);

  const addRawCell = useCallback(() => {
    const newCell: Cell = {
      id: generateCellId(),
      type: 'raw',
      content: '',
      outputs: [],
      enableEdit: true,
    };
    setCells([...cells, newCell]);
    return newCell.id;
  }, [cells, setCells]);

  const addAIThinkingCell = useCallback(
    (
      _props: Partial<{
        agentName: string;
        customText: string | null;
        textArray: string[];
        useWorkflowThinking: boolean;
      }> = {}
    ) => {
      const newCell: Cell = {
        id: generateCellId(),
        type: 'thinking',
        content: '',
        outputs: [],
        enableEdit: false,
      };
      setCells([...cells, newCell]);
      return newCell.id;
    },
    [cells, setCells]
  );

  return {
    addCodeCell,
    addMarkdownCell,
    addHybridCell,
    addRawCell,
    addAIThinkingCell,
  };
}
