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
import { WorkflowState } from '../observation/WorkflowState';

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

  determineNextTransition(state: WorkflowState, _apiResponse?: any): WorkflowEvent | null {
    // Check if there are planed steps
    const remainingSteps = this.getRemainingStepsFromPlanned(state);

    if (remainingSteps.length === 0) {
      console.log('[StepCompletedState] No planed steps, completing stage');
      return WorkflowEvent.COMPLETE_STAGE;
    }

    // Move to next step
    console.log(`[StepCompletedState] Moving to next step (${remainingSteps.length} planed)`);
    return WorkflowEvent.NEXT_STEP;
  }

  canTransitionTo(event: WorkflowEvent, state: WorkflowState): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    const remainingSteps = this.getRemainingStepsFromPlanned(state);

    // COMPLETE_STAGE requires no planed steps
    if (event === WorkflowEvent.COMPLETE_STAGE) {
      return remainingSteps.length === 0;
    }

    // NEXT_STEP requires planed steps
    if (event === WorkflowEvent.NEXT_STEP) {
      return remainingSteps.length > 0;
    }

    // Other transitions are allowed
    return true;
  }

  /**
   * Helper to get planed steps from planned list.
   * planed = planned - completed - current
   */
  private getRemainingStepsFromPlanned(state: WorkflowState): any[] {
    const progress = state.location.progress;
    const stepsProgress = progress.steps;
    const planned = stepsProgress.planned || [];

    if (planned.length === 0) {
      return [];
    }

    const completedIds = (stepsProgress.completed || []).map((s: any) => s.step_id);
    const currentId = stepsProgress.current?.step_id;

    // Filter planned steps that are not completed and not current
    return planned.filter((s: any) => !completedIds.includes(s.step_id) && s.step_id !== currentId);
  }

  getRequiredAPIType(): APIResponseType | null {
    // STEP_COMPLETED is a logic-only state - no API call needed
    // It auto-triggers COMPLETE_STAGE or NEXT_STEP based on remaining steps
    return null;
  }

  getExpectedTransitionName(): string | null {
    return 'COMPLETE_STAGE';
  }
}
