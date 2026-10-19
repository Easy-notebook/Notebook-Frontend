/**
 * ClearEffectHistoryAction - Clears the effect history
 * Action Type: clear_effect_history
 *
 * Used to clear the history of effects
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { WorkflowState } from '../../observation/WorkflowState';

export class ClearEffectHistoryAction extends ActionBase {
  /**
   * Handle clear_effect_history action
   */
  execute(step: ExecutionStep): void {
    const stateMachine = useWorkflowStateMachine.getState();
    stateMachine.updateState((stateJSON) => {
      if (stateJSON.state.effects.history.length === 0) return;
      const workflowState = new WorkflowState(stateJSON);
      ClearEffectHistoryAction.processState(workflowState);
      stateJSON.state.effects = workflowState.state.effects.toJSON();
    });
  }

  /**
   * Static helper to perform the logic on any state object
   * Useful for transition handlers that work on state copies
   */
  static processState(state: WorkflowState): void {
    const effects = state.state.effects;

    if (effects.history.length > 0) {
      const historyCount = effects.history.length;
      effects.clearHistory();
      console.log(`[ClearEffectHistory] Cleared ${historyCount} effects from history`);
    }
  }
}

// Register action
registerAction('clear_effect_history', ClearEffectHistoryAction);
