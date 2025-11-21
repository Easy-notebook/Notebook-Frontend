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
import { WorkflowEvent } from '../store/workflowStateMachine';

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

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // Check if we have a reflecting response indicating completion
    if (apiResponse && typeof apiResponse === 'object') {
      // Check for completion signal
      if (apiResponse.status === 'completed') {
        console.log('[BehaviorRunningState] Behavior completed successfully');
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
    const progress = this.getProgress(stateData);
    const behaviorsProgress = progress.behaviors || {};
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

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
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
}
