/**
 * STAGE_COMPLETED State Class
 * ===========================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/stage_completed_state.py
 *
 * Represents a stage that has just completed successfully.
 *
 * Valid outgoing transitions:
 * - COMPLETE_WORKFLOW -> COMPLETE (if no more stages)
 * - NEXT_STAGE -> STAGE_RUNNING (if more stages in workflow)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '../store/workflowStateMachine';

export class StageCompletedState extends BaseState {
  constructor() {
    super('STAGE_COMPLETED');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      complete_workflow: WorkflowEvent.COMPLETE_WORKFLOW,
      next_stage: WorkflowEvent.NEXT_STAGE,
      fail: WorkflowEvent.FAIL,
      cancel: WorkflowEvent.CANCEL,
    };
  }

  determineNextTransition(stateData: Record<string, any>, apiResponse?: any): WorkflowEvent | null {
    // Check if there are remaining stages
    const progress = this.getProgress(stateData);
    const stagesProgress = progress.stages || {};
    const remainingStages = stagesProgress.remaining || [];

    if (remainingStages.length === 0) {
      console.log('[StageCompletedState] No remaining stages, completing workflow');
      return WorkflowEvent.COMPLETE_WORKFLOW;
    }

    // Move to next stage
    console.log(`[StageCompletedState] Moving to next stage (${remainingStages.length} remaining)`);
    return WorkflowEvent.NEXT_STAGE;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    const progress = this.getProgress(stateData);
    const stagesProgress = progress.stages || {};
    const remainingStages = stagesProgress.remaining || [];

    // COMPLETE_WORKFLOW requires no remaining stages
    if (event === WorkflowEvent.COMPLETE_WORKFLOW) {
      return remainingStages.length === 0;
    }

    // NEXT_STAGE requires remaining stages
    if (event === WorkflowEvent.NEXT_STAGE) {
      return remainingStages.length > 0;
    }

    // Other transitions are allowed
    return true;
  }

  getRequiredAPIType(): APIResponseType | null {
    // STAGE_COMPLETED state requires Reflecting API for feedback
    return APIResponseType.COMPLETE;
  }
}
