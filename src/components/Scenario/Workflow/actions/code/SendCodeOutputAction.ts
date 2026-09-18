/**
 * SendCodeOutputAction - Sends code execution output for analysis
 * Replaces the legacy sendCurrentCellExecuteCodeResult from autoActions.ts
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useOperatorStore from '@Store/operatorStore';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import type { Operation } from '@Store/models/operation';

export interface CodeOutputPayload {
  executeResult: any[];
  executeCode: string;
  cellId: string;
  description?: string;
}

export class SendCodeOutputAction extends ActionBase {
  async execute(step: ExecutionStep): Promise<any> {
    const currentCell = useStore.getState().getCurrentCell();
    const notebookId = useStore.getState().notebookId;

    if (!currentCell) {
      console.warn('[SendCodeOutputAction] No current cell found');
      return { success: false, error: 'No current cell' };
    }

    if (currentCell.type !== 'code') {
      console.warn('[SendCodeOutputAction] Current cell is not a code cell');
      return { success: false, error: 'Not a code cell' };
    }

    const executeResult = currentCell.outputs;

    if (!executeResult) {
      console.warn('[SendCodeOutputAction] No execute result, executing cell first');
      useCodeStore.getState().executeCell(currentCell.id);
      return { success: false, error: 'No execute result' };
    }

    console.log(`[SendCodeOutputAction] Sending output for cell: ${currentCell.id}`);

    const operation: Operation = {
      type: 'code_output',
      payload: {
        executeResult: executeResult,
        executeCode: currentCell.content,
        cellId: currentCell.id,
        description: currentCell.description,
      } as CodeOutputPayload,
    };

    useOperatorStore.getState().sendOperation(notebookId, operation);

    return { success: true };
  }
}

registerAction('send_code_output', SendCodeOutputAction);
