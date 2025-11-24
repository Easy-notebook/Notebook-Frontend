/**
 * STEP_COMPLETED State Class
 * ==========================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/step_completed_state.py
 *
 * Represents a step that has just completed successfully.
 *
 * Valid outgoing transitions:
 * - COMPLETE_STAGE -> STAGE_COMPLETED (if no more steps)
 * - NEXT_STEP -> STEP_RUNNING (if more steps in stage)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '@Store/models';

export class StepCompletedState extends BaseState {
  constructor() {
    super('STEP_COMPLETED');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      complete_stage: WorkflowEvent.COMPLETE_STAGE,
      next_step: WorkflowEvent.NEXT_STEP,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // Check if there are remaining steps
    const progress = this.getProgress(stateData);
    const stepsProgress = progress.steps || {};
    const remainingSteps = stepsProgress.remaining || [];

    if (remainingSteps.length === 0) {
      console.log('[StepCompletedState] No remaining steps, completing stage');
      return WorkflowEvent.COMPLETE_STAGE;
    }

    // Move to next step
    console.log(`[StepCompletedState] Moving to next step (${remainingSteps.length} remaining)`);
    return WorkflowEvent.NEXT_STEP;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    const progress = this.getProgress(stateData);
    const stepsProgress = progress.steps || {};
    const remainingSteps = stepsProgress.remaining || [];

    // COMPLETE_STAGE requires no remaining steps
    if (event === WorkflowEvent.COMPLETE_STAGE) {
      return remainingSteps.length === 0;
    }

    // NEXT_STEP requires remaining steps
    if (event === WorkflowEvent.NEXT_STEP) {
      return remainingSteps.length > 0;
    }

    // Other transitions are allowed
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // STEP_COMPLETED state requires Reflecting API for feedback
    return APIResponseType.COMPLETE;
  }

  getExpectedTransitionName(): string | null {
    return 'COMPLETE_STAGE';
  }
}
