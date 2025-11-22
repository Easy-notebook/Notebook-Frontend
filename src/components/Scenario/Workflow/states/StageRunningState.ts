/**
 * STAGE_RUNNING State Class
 * =========================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/stage_running_state.py
 *
 * Represents a stage that is currently running and ready to execute steps.
 *
 * Valid outgoing transitions:
 * - START_STEP -> STEP_RUNNING (when planning API returns steps)
 * - COMPLETE_STAGE -> STAGE_COMPLETED (when all steps are done)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '@Store/models';

export class StageRunningState extends BaseState {
  constructor() {
    super('STAGE_RUNNING');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      start_step: WorkflowEvent.START_STEP,
      complete_stage: WorkflowEvent.COMPLETE_STAGE,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // Check if we have a planning response with steps
    if (apiResponse && typeof apiResponse === 'object') {
      if (Array.isArray(apiResponse.steps) && apiResponse.steps.length > 0) {
        console.log(
          '[StageRunningState] Planning response received with steps, transitioning to STEP_RUNNING'
        );
        return WorkflowEvent.START_STEP;
      }
    }

    // Check if stage is completed (no remaining steps)
    const progress = this.getProgress(stateData);
    const stepsProgress = progress.steps || {};
    const remainingSteps = stepsProgress.remaining || [];

    if (remainingSteps.length === 0 && !stepsProgress.current) {
      console.log('[StageRunningState] No remaining steps, stage completed');
      return WorkflowEvent.COMPLETE_STAGE;
    }

    // No transition needed yet
    console.log('[StageRunningState] No transition conditions met');
    return null;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    // Additional conditions for specific transitions
    if (event === WorkflowEvent.COMPLETE_STAGE) {
      // Can only complete if no steps remaining
      const progress = this.getProgress(stateData);
      const stepsProgress = progress.steps || {};
      const remainingSteps = stepsProgress.remaining || [];
      return remainingSteps.length === 0;
    }

    // START_STEP, FAIL, CANCEL are always allowed
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // STAGE_RUNNING state requires Planning API to get steps
    return APIResponseType.PLANNING;
  }
}
