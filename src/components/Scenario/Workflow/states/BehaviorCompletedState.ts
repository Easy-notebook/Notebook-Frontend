/**
 * BEHAVIOR_COMPLETED State Class
 * ==============================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/behavior_completed_state.py
 *
 * Represents a behavior that has just completed successfully.
 *
 * Valid outgoing transitions:
 * - NEXT_BEHAVIOR -> BEHAVIOR_RUNNING (if more behaviors needed)
 * - COMPLETE_STEP -> STEP_COMPLETED (if step is done)
 * - REFLECTING_AGAIN -> BEHAVIOR_COMPLETED (if behavior needs to be reflected again)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '@Store/models';

export class BehaviorCompletedState extends BaseState {
  constructor() {
    super('BEHAVIOR_COMPLETED');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      next_behavior: WorkflowEvent.NEXT_BEHAVIOR,
      complete_step: WorkflowEvent.COMPLETE_STEP,
      reflecting_again: WorkflowEvent.REFLECTING_AGAIN,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // Check API response for explicit completion signal
    if (apiResponse && typeof apiResponse === 'object') {
      const actions = apiResponse.actions || [];

      // Check for mark_step_complete (underscore or hyphen)
      if (
        Array.isArray(actions) &&
        actions.some((a: any) => a.type === 'mark_step_complete' || a.type === 'mark-step-complete')
      ) {
        console.log('[BehaviorCompletedState] Received mark_step_complete action, completing step');
        return WorkflowEvent.COMPLETE_STEP;
      }

      // Check for continue_behavior
      if (Array.isArray(actions) && actions.some((a: any) => a.type === 'continue_behavior')) {
        console.log(
          '[BehaviorCompletedState] Received continue_behavior action, transitioning to NEXT_BEHAVIOR'
        );
        return WorkflowEvent.NEXT_BEHAVIOR;
      }
    }
    return WorkflowEvent.REFLECTING_AGAIN;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    // Other transitions are allowed
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // BEHAVIOR_COMPLETED state requires Reflecting API for feedback
    return APIResponseType.COMPLETE;
  }

  getExpectedTransitionName(): string | null {
    return 'COMPLETE_STEP';
  }
}
