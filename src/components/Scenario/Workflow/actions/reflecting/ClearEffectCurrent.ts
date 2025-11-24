/**
 * ClearEffectCurrentAction - Moves current effects to history
 * Action Type: clear_effect_current
 *
 * Used during BEHAVIOR_COMPLETED reflecting to clear effects before next reflection
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class ClearEffectCurrentAction extends ActionBase {
  /**
   * Handle clear_effect_current action
   */
  execute(step: ExecutionStep): void {
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // Use the static helper to perform the logic
    ClearEffectCurrentAction.processState(stateJSON);

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

    if (effectsContainer) {
      const currentEffects = effectsContainer.current || [];

      if (currentEffects.length > 0) {
        if (!effectsContainer.history) {
          effectsContainer.history = [];
        }
        effectsContainer.history.push(...currentEffects);
        effectsContainer.current = [];

        console.log(`[ClearEffectCurrent] Moved ${currentEffects.length} effects to history`);

        // Also update the store directly to ensure persistence across async boundaries
        try {
          const stateMachine = useWorkflowStateMachine.getState();
          // Only update if we are modifying a copy and want to sync back,
          // OR if we are called with the store's state object itself.
          // But to be safe, let's force an update if we are in the browser environment
          if (typeof window !== 'undefined') {
            const currentStateJSON = stateMachine.stateJSON;
            // Check if we are operating on the live state object
            if (state === currentStateJSON) {
              stateMachine.setState(currentStateJSON);
            } else {
              // We are operating on a copy (e.g. in a handler)
              // We should probably NOT update the store here blindly as it might overwrite other changes.
              // However, the issue is that the handler returns this copy, and the coordinator returns it,
              // and the adapter updates the store with it.
              // The problem described by the user suggests the update isn't "sticking".
              // This implies that when the next API call happens, it uses a state that still has effects.
              // Let's ensure we are clearing the RIGHT effects container.
              // Double check if there are other places effects might be stored.
            }
          }
        } catch (e) {
          console.warn('[ClearEffectCurrent] Failed to access store:', e);
        }
      }
    }
  }
}

// Register action
registerAction('clear_effect_current', ClearEffectCurrentAction);
