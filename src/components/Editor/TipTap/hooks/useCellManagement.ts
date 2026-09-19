/**
 * Cell Management Hook
 * Handles adding different types of cells to the notebook
 */

import { useCallback } from 'react';
import type { Cell } from '@Store/models';
import { generateCellId } from '@Editor/utils/cellConverters';

interface UseCellManagementProps {
  getCells: () => readonly Cell[];
  setCells: (cells: Cell[]) => void;
}

export function useCellManagement({ getCells, setCells }: UseCellManagementProps) {
  const addCell = useCallback((type: Cell['type']) => {
    const newCell: Cell = {
      id: generateCellId(),
      type,
      content: '',
      outputs: [],
      enableEdit: type !== 'thinking',
      ...(type === 'code' || type === 'hybrid' ? { language: 'python' } : {}),
    };
    setCells([...getCells(), newCell]);
    return newCell.id;
  }, [getCells, setCells]);

  const addCodeCell = useCallback(() => addCell('code'), [addCell]);
  const addMarkdownCell = useCallback(() => addCell('markdown'), [addCell]);
  const addHybridCell = useCallback(() => addCell('hybrid'), [addCell]);
  const addRawCell = useCallback(() => addCell('raw'), [addCell]);

  const addAIThinkingCell = useCallback(
    (
      _props: Partial<{
        agentName: string;
        customText: string | null;
        textArray: string[];
        useWorkflowThinking: boolean;
      }> = {}
    ) => {
      return addCell('thinking');
    },
    [addCell]
  );

  return {
    addCodeCell,
    addMarkdownCell,
    addHybridCell,
    addRawCell,
    addAIThinkingCell,
  };
}
