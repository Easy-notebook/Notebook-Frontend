/**
 * CompleteReflectionAction - Marks reflection as complete
 * Stream Action Type: complete_reflection
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useNotebookStore from '@Store/notebookStore';
import { useWorkflowStateMachine } from '@WorkflowMode/store/workflowStateMachine';
import { WorkflowState, WorkflowEvent } from '@Store/models';

export class CompleteReflectionAction extends StreamAction {
  static actionType = 'complete_reflection';

  async execute(_context: StreamActionContext): Promise<void> {
    console.log('[CompleteReflectionAction] Completing reflection');

    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;

    // Find last code cell to update metadata
    let lastCodeCell = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].type === 'code') {
        lastCodeCell = cells[i];
        break;
      }
    }

    if (lastCodeCell && lastCodeCell.metadata?.debug) {
      const existingDebug = lastCodeCell.metadata.debug;
      notebookStore.updateCellMetadata(lastCodeCell.id, {
        ...lastCodeCell.metadata,
        debug: {
          ...existingDebug,
          isDebugging: false,
          debugEndTime: new Date().toISOString(),
        },
      });
    }

    // Update FSM State
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    if (stateJSON.state.FSM.state === WorkflowState.BEHAVIOR_COMPLETED) {
      stateJSON.state.FSM.state = WorkflowState.BEHAVIOR_RUNNING;
      stateJSON.state.FSM.last_transition = WorkflowEvent.REFLECTING_AGAIN;
      console.log('[CompleteReflectionAction] Transitioned FSM to BEHAVIOR_RUNNING');
      stateMachine.setState(stateJSON);
    }
  }
}

registerStreamAction(CompleteReflectionAction.actionType, CompleteReflectionAction);
