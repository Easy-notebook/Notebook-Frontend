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
import { WorkflowEvent } from '@Store/models';

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

  determineNextTransition(
    stateData: Record<string, any>,
    _apiResponse?: any
  ): WorkflowEvent | null {
    // Check if there are planed stages
    const remainingStages = this.getRemainingStagesFromPlanned(stateData);

    if (remainingStages.length === 0) {
      console.log('[StageCompletedState] No planed stages, completing workflow');
      return WorkflowEvent.COMPLETE_WORKFLOW;
    }

    // Move to next stage
    console.log(`[StageCompletedState] Moving to next stage (${remainingStages.length} planed)`);
    return WorkflowEvent.NEXT_STAGE;
  }

  canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    const remainingStages = this.getRemainingStagesFromPlanned(stateData);

    // COMPLETE_WORKFLOW requires no planed stages
    if (event === WorkflowEvent.COMPLETE_WORKFLOW) {
      return remainingStages.length === 0;
    }

    // NEXT_STAGE requires planed stages
    if (event === WorkflowEvent.NEXT_STAGE) {
      return remainingStages.length > 0;
    }

    // Other transitions are allowed
    return true;
  }

  /**
   * Helper to get planed stages from planned list.
   * planed = planned - completed - current
   */
  private getRemainingStagesFromPlanned(stateData: Record<string, any>): any[] {
    const progress = this.getProgress(stateData);
    const stagesProgress = progress.stages || {};
    const planned = stagesProgress.planned || [];

    if (planned.length === 0) {
      return [];
    }

    const completedIds = (stagesProgress.completed || []).map((s: any) => s.stage_id);
    const currentId = stagesProgress.current?.stage_id;

    // Filter planned stages that are not completed and not current
    return planned.filter(
      (s: any) => !completedIds.includes(s.stage_id) && s.stage_id !== currentId
    );
  }

  getRequiredAPIType(): APIResponseType | null {
    // STAGE_COMPLETED is a logic-only state - no API call needed
    // It auto-triggers COMPLETE_WORKFLOW or NEXT_STAGE based on remaining stages
    return null;
  }

  getExpectedTransitionName(): string | null {
    return 'COMPLETE_WORKFLOW';
  }
}
