/**
 * CompleteReflectionAction - Marks reflection phase as complete
 *
 * Handles the complete_reflection action from /reflecting API response.
 * This action signals that all debug actions are complete and
 * the state machine can proceed to the next transition.
 *
 * Expected step format:
 * {
 *   action: 'complete_reflection'
 * }
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';
import type { DebugMetadata } from './BugAnalysisAction';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { WorkflowState, WorkflowEvent } from '@Store/models';

export class CompleteReflectionAction extends ActionBase {
  execute(step: ExecutionStep): boolean {
    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;

    // Find the last code cell and finalize debug metadata
    let lastCodeCell = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].type === 'code') {
        lastCodeCell = cells[i];
        break;
      }
    }

    if (lastCodeCell && lastCodeCell.metadata?.debug) {
      const existingDebug = lastCodeCell.metadata.debug as Partial<DebugMetadata>;

      // Mark debugging as complete
      notebookStore.updateCellMetadata(lastCodeCell.id, {
        ...lastCodeCell.metadata,
        debug: {
          ...existingDebug,
          isDebugging: false,
          debugEndTime: new Date().toISOString(),
        },
      });

      console.log(`[CompleteReflectionAction] Finalized debug for cell ${lastCodeCell.id}`);
    }

    // Update Workflow State to BEHAVIOR_RUNNING
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // Only transition if we are currently in BEHAVIOR_COMPLETED (which is where reflection happens)
    if (stateJSON.state.FSM.state === WorkflowState.BEHAVIOR_COMPLETED) {
      stateJSON.state.FSM.state = WorkflowState.BEHAVIOR_RUNNING;
      stateJSON.state.FSM.last_transition = WorkflowEvent.REFLECTING_AGAIN; // Or a new event like COMPLETE_REFLECTION
      // Using REFLECTING_AGAIN might be confusing if we are done reflecting.
      // But if we go to BEHAVIOR_RUNNING, we are effectively "running" again.
      console.log('[CompleteReflectionAction] Transitioning FSM to BEHAVIOR_RUNNING');

      stateMachine.setState(stateJSON);
    }

    console.log('[CompleteReflectionAction] Reflection phase completed');

    // Return true to signal completion
    return true;
  }
}

registerAction('complete_reflection', CompleteReflectionAction);
