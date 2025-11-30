/**
 * ExecNewVersionAction - Executes the fixed code cell
 * Stream Action Type: exec_new_version
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useNotebookStore from '@Store/notebookStore';
import useScriptStore from '@WorkflowMode/store/useScriptStore';
import { useWorkflowStateMachine } from '@WorkflowMode/store/workflowStateMachine';
import { WorkflowState } from '@WorkflowMode/observation/WorkflowState';
import { ClearEffectCurrentAction } from '@WorkflowMode/actions/reflecting/ClearEffectCurrent';

export class ExecNewVersionAction extends StreamAction {
  static actionType = 'exec_new_version';

  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;
    const p = payload as any;
    console.log('[ExecNewVersionAction] Executing new version');

    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;
    let targetCell = null;

    if (p.cellId || p.codecell_id) {
      const id = p.cellId || p.codecell_id;
      targetCell = cells.find((c) => c.id === id);
    } else {
      // Find last code cell
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i].type === 'code') {
          targetCell = cells[i];
          break;
        }
      }
    }

    if (targetCell) {
      // Clear effects first (reusing the logic we implemented in Workflow action)
      const stateMachine = useWorkflowStateMachine.getState();
      const stateJSON = stateMachine.stateJSON;
      const workflowState = new WorkflowState(stateJSON);

      ClearEffectCurrentAction.processState(workflowState);
      stateMachine.setState(workflowState.toJSON());

      // Execute cell
      const scriptStore = useScriptStore.getState();
      await scriptStore.execCodeCell(targetCell.id, true, false);

      // Update metadata (execCodeCell handles some, but we can ensure debug flags)
      const updatedCell = useNotebookStore.getState().cells.find((c) => c.id === targetCell!.id);
      if (updatedCell) {
        const existingDebug = updatedCell.metadata?.debug || {};
        useNotebookStore.getState().updateCellMetadata(updatedCell.id, {
          ...updatedCell.metadata,
          debug: {
            ...existingDebug,
            executedAfterFix: true,
          },
        });
      }

      console.log(`[ExecNewVersionAction] Executed cell ${targetCell.id}`);
    } else {
      console.warn('[ExecNewVersionAction] No target cell found');
    }
  }
}

registerStreamAction(ExecNewVersionAction.actionType, ExecNewVersionAction);
