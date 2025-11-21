/**
 * STEP_RUNNING State Class
 * ========================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/step_running_state.py
 *
 * Represents a step that is currently running and ready to execute behaviors.
 *
 * Valid outgoing transitions:
 * - START_BEHAVIOR -> BEHAVIOR_RUNNING (when planning API returns behaviors)
 * - COMPLETE_STEP -> STEP_COMPLETED (when all behaviors are done)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '../store/workflowStateMachine';

export class StepRunningState extends BaseState {
  constructor() {
    super('STEP_RUNNING');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      start_behavior: WorkflowEvent.START_BEHAVIOR,
      complete_step: WorkflowEvent.COMPLETE_STEP,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // Check if we have a planning response with behavior
    if (apiResponse && typeof apiResponse === 'object') {
      // Planning API can return either:
      // 1. behaviors array: { behaviors: [...] }
      // 2. single behavior object: { behavior_id, title, agent, task, ... }

      // Check for behaviors array (legacy format)
      if (Array.isArray(apiResponse.behaviors) && apiResponse.behaviors.length > 0) {
        console.log(
          '[StepRunningState] Planning response received with behaviors array, transitioning to BEHAVIOR_RUNNING'
        );
        return WorkflowEvent.START_BEHAVIOR;
      }

      // Check for single behavior object (current backend format)
      if ('behavior_id' in apiResponse) {
        console.log(
          '[StepRunningState] Planning response received with behavior object, transitioning to BEHAVIOR_RUNNING'
        );
        return WorkflowEvent.START_BEHAVIOR;
      }
    }

    // Check if step is completed (all expected outputs produced)
    const progress = this.getProgress(stateData);
    const stepsProgress = progress.steps || {};
    const currentOutputs = stepsProgress.current_outputs || {};

    const expected = currentOutputs.expected || [];
    const produced = currentOutputs.produced || [];

    if (expected.length > 0 && produced.length >= expected.length) {
      console.log('[StepRunningState] All expected outputs produced, step completed');
      return WorkflowEvent.COMPLETE_STEP;
    }

    // No transition needed yet
    console.log('[StepRunningState] No transition conditions met');
    return null;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    // Additional conditions for specific transitions
    if (event === WorkflowEvent.COMPLETE_STEP) {
      // Check if outputs are satisfied
      const progress = this.getProgress(stateData);
      const stepsProgress = progress.steps || {};
      const currentOutputs = stepsProgress.current_outputs || {};

      const expected = currentOutputs.expected || [];
      const produced = currentOutputs.produced || [];

      // Can complete if all expected outputs are produced
      return expected.length > 0 ? produced.length >= expected.length : true;
    }

    // START_BEHAVIOR, FAIL, CANCEL are always allowed
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // STEP_RUNNING state requires Planning API to get behaviors
    return APIResponseType.PLANNING;
  }
}
