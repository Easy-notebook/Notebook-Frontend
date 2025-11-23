/**
 * Run Current Code Cell Action - Handles runCurrentCodeCell stream type
 * Executes the current code cell and records the action to agent memory
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class RunCurrentCodeCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;
    const cellId = payload?.cellId;

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (targetCellId) {
      const targetCell = state.cells.find((c) => c.id === targetCellId);

      if (targetCell && targetCell.type === 'code') {
        // Execute the cell
        await state.runSingleCell(targetCellId);

        // Record to agent memory if available
        try {
          const { useAIAgentStore } = await import('@Store/AIAgentStore');
          const agentState = useAIAgentStore.getState();
          const runningQA = agentState.qaList.find((q: any) => q.onProcess) || agentState.qaList[0];

          if (runningQA) {
            agentState.addToolCallToQA(runningQA.id, {
              type: 'execute-code',
              content: targetCell.content || '',
              agent: 'code-executor',
            });
          }
        } catch (error) {
          console.error('Failed to record code execution to agent memory:', error);
        }
      }
    }
  }
}

registerStreamAction('runCurrentCodeCell', RunCurrentCodeCellAction);
