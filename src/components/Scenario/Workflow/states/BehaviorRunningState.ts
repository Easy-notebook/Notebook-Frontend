/**
 * BEHAVIOR_RUNNING State Class
 * ============================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/behavior_running_state.py
 *
 * Represents a behavior that is currently being generated/executed.
 *
 * Valid outgoing transitions:
 * - COMPLETE_BEHAVIOR -> BEHAVIOR_COMPLETED (when behavior passes feedback)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '@Store/models';
import { WorkflowState } from '../observation/WorkflowState';

export class BehaviorRunningState extends BaseState {
  constructor() {
    super('BEHAVIOR_RUNNING');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      complete_behavior: WorkflowEvent.COMPLETE_BEHAVIOR,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(state: WorkflowState, apiResponse?: any): WorkflowEvent | null {
    // Check if we have a reflecting response indicating completion
    if (apiResponse && typeof apiResponse === 'object') {
      // Check for completion signal
      if (apiResponse.status === 'completed') {
        console.log('[BehaviorRunningState] Behavior completed successfully');
        return WorkflowEvent.COMPLETE_BEHAVIOR;
      }

      // Check for actions array (streaming format)
      // Any action from generating API implies we are running/completing behavior
      // But we need to know when to transition to BEHAVIOR_COMPLETED
      // Usually, the presence of actions means we executed them, so we can transition
      if (Array.isArray(apiResponse.actions) && apiResponse.actions.length > 0) {
        console.log(
          '[BehaviorRunningState] Received actions from generating API, transitioning to BEHAVIOR_COMPLETED'
        );
        return WorkflowEvent.COMPLETE_BEHAVIOR;
      }

      // Check if feedback passed
      const feedback = apiResponse.feedback || {};
      if (feedback.passed === true) {
        console.log('[BehaviorRunningState] Behavior feedback passed, completing behavior');
        return WorkflowEvent.COMPLETE_BEHAVIOR;
      }
    }

    // Check behavior outputs
    const progress = state.location.progress;
    const behaviorsProgress = progress.behaviors;
    const currentOutputs = behaviorsProgress.current_outputs || {};

    const expected = currentOutputs.expected || [];
    const produced = currentOutputs.produced || [];

    if (expected.length > 0 && produced.length >= expected.length) {
      console.log('[BehaviorRunningState] All expected behavior outputs produced');
      return WorkflowEvent.COMPLETE_BEHAVIOR;
    }

    // No transition needed yet
    console.log('[BehaviorRunningState] Behavior still running');
    return null;
  }

  canTransitionTo(event: WorkflowEvent, _state: WorkflowState): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    // All transitions are generally allowed from BEHAVIOR_RUNNING
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // BEHAVIOR_RUNNING state requires Generating API to execute actions
    return APIResponseType.GENERATING;
  }

  getExpectedTransitionName(): string | null {
    return 'COMPLETE_BEHAVIOR';
  }
}
