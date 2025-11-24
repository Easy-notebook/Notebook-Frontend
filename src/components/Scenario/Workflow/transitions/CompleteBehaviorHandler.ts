/**
 * COMPLETE_BEHAVIOR Event Handler
 * Handles action completion from generating API.
 * Event: COMPLETE_BEHAVIOR
 * Transition: BEHAVIOR_RUNNING → BEHAVIOR_COMPLETED
 *
 * Ported from: ref/Notebook-BCC/core/transition_handlers/COMPLETE_BEHAVIOR_handler.py
 */

import { BaseTransitionHandler } from './BaseTransitionHandler';

export class CompleteBehaviorHandler extends BaseTransitionHandler {
  constructor() {
    super('BEHAVIOR_RUNNING', 'BEHAVIOR_COMPLETED', 'COMPLETE_BEHAVIOR');
  }

  canHandle(apiResponse: any): boolean {
    if (typeof apiResponse !== 'object' || apiResponse === null) {
      console.log('[CompleteBehavior] canHandle: Not an object');
      return false;
    }

    // Check if response has actions field
    const actions = apiResponse.actions;
    console.log('[CompleteBehavior] canHandle: checking actions', {
      hasActions: 'actions' in apiResponse,
      isArray: Array.isArray(actions),
      length: Array.isArray(actions) ? actions.length : 'N/A',
      hasCount: 'count' in apiResponse,
    });

    if (!Array.isArray(actions)) {
      console.log('[CompleteBehavior] canHandle: actions is not an array');
      return false;
    }

    // Distinguish from planning API: check for planning control signals
    // Planning API actions include: plan_stage, plan_step, delegate_task, complete_*_planning
    for (const action of actions) {
      if (typeof action === 'object' && action !== null) {
        const actionType = action.type || '';
        if (
          actionType === 'plan_stage' ||
          actionType === 'complete_workflow_planning' ||
          actionType === 'plan_step' ||
          actionType === 'update_stage_context' ||
          actionType === 'complete_stage_planning' ||
          actionType === 'delegate_task' ||
          actionType === 'complete_step_planning'
        ) {
          // This is a planning API response, not generating API
          console.log('[CompleteBehavior] canHandle: Found planning signal, this is planning API');
          return false;
        }
      }
    }

    // Distinguish from reflecting API: check for reflecting control signals
    // If any action is a control signal, this is from reflecting API
    for (const action of actions) {
      if (typeof action === 'object' && action !== null) {
        const actionType = action.type || '';
        if (
          actionType === 'complete_reflection' ||
          actionType === 'mark-step-complete' ||
          actionType === 'mark-stage-complete'
        ) {
          // This is a reflecting API response, not generating API
          console.log(
            '[CompleteBehavior] canHandle: Found reflecting signal, this is reflecting API'
          );
          return false;
        }
      }
    }

    // Accept generating API response even with empty actions
    // Some behaviors might not need any actions
    const canHandle = true; // Changed from: actions.length > 0
    console.log('[CompleteBehavior] canHandle:', canHandle, `(${actions.length} actions)`);
    return canHandle;
  }

  async apply(state: Record<string, any>, apiResponse: any): Promise<Record<string, any>> {
    const newState = this.deepCopyState(state);

    const actions = apiResponse.actions || [];
    const actionCount = apiResponse.count || actions.length;

    console.log(`[CompleteBehavior] Applying actions transition: ${actionCount} actions received`);
    console.log(
      `[CompleteBehavior] Note: Actions are executed in streaming mode by AsyncStateMachineAdapter`
    );

    // Actions are already executed in streaming mode by AsyncStateMachineAdapter
    // No need to execute them again here
    // Just sync the notebook state to ensure it's up to date

    // Sync notebook state after executing actions
    this.syncNotebookToState(newState);

    // Update FSM state to BEHAVIOR_COMPLETED
    this.updateFSMState(newState, 'BEHAVIOR_COMPLETED', 'COMPLETE_ACTION');

    console.log('[CompleteBehavior] Transition complete');

    return newState;
  }

  /**
   * Execute all actions from the generating API.
   */
  private executeActions(actions: any[]): void {
    for (let i = 0; i < actions.length; i++) {
      const actionDict = actions[i];
      if (typeof actionDict !== 'object' || actionDict === null) {
        console.warn(`[CompleteBehavior] Action ${i} is not a dict, skipping`);
        continue;
      }

      const actionType = actionDict.type || 'unknown';
      const content = actionDict.content || '';

      console.log(`[CompleteBehavior] Executing action ${i + 1}/${actions.length}: ${actionType}`);

      try {
        // Create ExecutionStep from action dict
        const executionStep = {
          action: actionType,
          content,
          storeId: actionDict.store_id || this.generateUUID(),
          metadata: actionDict.metadata || {},
          // Pass through any other fields from action_dict
          ...Object.fromEntries(
            Object.entries(actionDict).filter(
              ([k]) => !['type', 'content', 'store_id', 'metadata'].includes(k)
            )
          ),
        };

        // Execute the action
        this.scriptStore.execAction(executionStep);
        console.log(`[CompleteBehavior] Action ${i + 1} executed successfully: ${actionType}`);
      } catch (error) {
        console.error(
          `[CompleteBehavior] Failed to execute action ${i + 1} (${actionType}):`,
          error
        );
        // Continue with planed actions even if one fails
      }
    }
  }
}
