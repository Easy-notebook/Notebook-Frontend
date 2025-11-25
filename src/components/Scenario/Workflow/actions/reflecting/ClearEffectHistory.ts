/**
 * ClearEffectHistoryAction - Clears the effect history
 * Action Type: clear_effect_history
 *
 * Used to clear the history of effects
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class ClearEffectHistoryAction extends ActionBase {
  /**
   * Handle clear_effect_history action
   */
  execute(step: ExecutionStep): void {
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // Use the static helper to perform the logic
    ClearEffectHistoryAction.processState(stateJSON);

    stateMachine.setState(stateJSON);
  }

  /**
   * Static helper to perform the logic on any state object
   * Useful for transition handlers that work on state copies
   */
  static processState(state: any): void {
    // Try to find effects in state.state.effects (Standard StateJSON)
    let effectsContainer = state.state?.effects;

    // Fallback: check observation.context.effects (Legacy/Alternative)
    if (!effectsContainer && state.observation?.context?.effects) {
      effectsContainer = state.observation.context.effects;
    }

    if (effectsContainer && effectsContainer.history) {
      const historyCount = effectsContainer.history.length;
      if (historyCount > 0) {
        effectsContainer.history = [];
        console.log(`[ClearEffectHistory] Cleared ${historyCount} effects from history`);
      }
    }
  }
}

// Register action
registerAction('clear_effect_history', ClearEffectHistoryAction);
