/**
 * CompleteBehaviorAction - Marks behavior execution as complete
 * Action Type: complete_behavior (and complete_behaviour)
 *
 * Transitions from BEHAVIOR_RUNNING to BEHAVIOR_COMPLETED
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { WorkflowState, WorkflowEvent } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class CompleteBehaviorAction extends ActionBase {
  /**
   * Handle complete_behavior action
   */
  execute(step: ExecutionStep): void {
    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    console.log(`[CompleteBehaviorAction] Behavior execution complete`);

    // Transition to BEHAVIOR_COMPLETED
    if (stateJSON.state.FSM.state === WorkflowState.BEHAVIOR_RUNNING) {
      stateJSON.state.FSM.state = WorkflowState.BEHAVIOR_COMPLETED;
      stateJSON.state.FSM.last_transition = WorkflowEvent.COMPLETE_BEHAVIOR;
      console.log('[CompleteBehaviorAction] ✅ Transitioned to BEHAVIOR_COMPLETED');
    }

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action with both spellings
registerAction('complete_behavior', CompleteBehaviorAction);
registerAction('complete_behaviour', CompleteBehaviorAction);
