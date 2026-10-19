import { NotebookActionScope } from '@/services/notebook/NotebookActionScope';
import { CapturedQAEvent } from '../../CapturedQAEvent';
/**
 * Run Current Code Cell Action - Handles runCurrentCodeCell stream type
 * Executes the current code cell and records the action to agent memory
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class RunCurrentCodeCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    context.signal?.throwIfAborted();
    const { payload } = context;
    const cellId = payload?.cellId;

    const state = useStore.getState();
    if (context.notebookId !== undefined && context.notebookId !== state.notebookId) return;
    const targetCellId = cellId || state.currentCellId;

    if (targetCellId) {
      const targetCell = state.cells.find((c) => c.id === targetCellId);

      if (targetCell && targetCell.type === 'code') {
        const event = new CapturedQAEvent(
          { type: 'execute-code', content: targetCell.content || '', agent: 'code-executor' },
          payload.QId
        );
        const scope = new NotebookActionScope(context.signal);
        try {
          scope.begin();
          await state.runSingleCell(targetCellId);
          scope.signal.throwIfAborted();
          event.record();
        } finally {
          scope.dispose();
        }
      }
    }
  }
}

registerStreamAction('runCurrentCodeCell', RunCurrentCodeCellAction);
