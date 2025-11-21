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
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '../store/workflowStateMachine';

export class BehaviorCompletedState extends BaseState {
  constructor() {
    super('BEHAVIOR_COMPLETED');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      next_behavior: WorkflowEvent.NEXT_BEHAVIOR,
      complete_step: WorkflowEvent.COMPLETE_STEP,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // First, check if effect.current is not empty
    // If not empty, we must transition to NEXT_BEHAVIOR to clear effects
    // This ensures: 执行必须要有反馈并维护到对应的上下文context中才是有效的维护
    const context = stateData.observation?.context || {};
    const effects = context.effects || {};
    const currentEffects = effects.current || [];

    if (currentEffects.length > 0) {
      console.warn(
        `[BehaviorCompletedState] [EXECUTION INTEGRITY CHECK] effect.current is not empty (${currentEffects.length} effects). ` +
          `Code execution results MUST be analyzed and commented before completing step. ` +
          `Forcing NEXT_BEHAVIOR to ensure feedback loop.`
      );
      return WorkflowEvent.NEXT_BEHAVIOR;
    }

    // Check if step is completed
    const progress = this.getProgress(stateData);
    const stepsProgress = progress.steps || {};
    const currentOutputs = stepsProgress.current_outputs || {};

    const expected = currentOutputs.expected || [];
    const produced = currentOutputs.produced || [];

    if (expected.length > 0 && produced.length >= expected.length) {
      console.log('[BehaviorCompletedState] Step outputs satisfied, completing step');
      return WorkflowEvent.COMPLETE_STEP;
    }

    // Need more behaviors
    console.log('[BehaviorCompletedState] Step not complete, need next behavior');
    return WorkflowEvent.NEXT_BEHAVIOR;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    // COMPLETE_STEP requires outputs to be satisfied
    if (event === WorkflowEvent.COMPLETE_STEP) {
      const progress = this.getProgress(stateData);
      const stepsProgress = progress.steps || {};
      const currentOutputs = stepsProgress.current_outputs || {};

      const expected = currentOutputs.expected || [];
      const produced = currentOutputs.produced || [];

      return expected.length > 0 ? produced.length >= expected.length : true;
    }

    // Other transitions are allowed
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // BEHAVIOR_COMPLETED state requires Reflecting API for feedback
    return APIResponseType.COMPLETE;
  }
}
