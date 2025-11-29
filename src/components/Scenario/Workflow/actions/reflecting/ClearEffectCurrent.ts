/**
 * ClearEffectCurrentAction - Moves current effects to history
 * Action Type: clear_effect_current
 *
 * Used during BEHAVIOR_COMPLETED reflecting to clear effects before next reflection
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { WorkflowState } from '../../observation/WorkflowState';

export class ClearEffectCurrentAction extends ActionBase {
  /**
   * Handle clear_effect_current action
   */
  execute(step: ExecutionStep): void {
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const workflowState = new WorkflowState(stateJSON);

    // Use the static helper to perform the logic
    ClearEffectCurrentAction.processState(workflowState);

    stateMachine.setState(workflowState.toJSON());
  }

  /**
   * Static helper to perform the logic on any state object
   * Useful for transition handlers that work on state copies
   */
  static processState(state: WorkflowState): void {
    const effects = state.state.effects;

    if (effects.current.length > 0) {
      effects.moveCurrentToHistory();
      console.log(`[ClearEffectCurrent] Moved effects to history`);
    }
  }
}

// Register action
registerAction('clear_effect_current', ClearEffectCurrentAction);
