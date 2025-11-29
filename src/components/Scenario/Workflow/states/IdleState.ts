/**
 * IDLE State Class
 * ================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/idle_state.py
 *
 * Represents the idle state where the workflow is waiting to begin.
 *
 * Valid outgoing transitions:
 * - START_WORKFLOW -> STAGE_RUNNING (when planning API returns stages)
 */

import { BaseState, APIResponseType } from './BaseState';
import { WorkflowEvent } from '@Store/models';
import { WorkflowState } from '../observation/WorkflowState';

export class IdleState extends BaseState {
  constructor() {
    super('IDLE');
  }

  getValidTransitions(): Record<string, WorkflowEvent> {
    return {
      start_workflow: WorkflowEvent.START_WORKFLOW,
      fail: WorkflowEvent.FAIL,
    };
  }

  determineNextTransition(_state: WorkflowState, apiResponse?: any): WorkflowEvent | null {
    // Check if we have a planning response with stages
    if (apiResponse && typeof apiResponse === 'object') {
      // Legacy format: stages array
      if (Array.isArray(apiResponse.stages) && apiResponse.stages.length > 0) {
        console.log(
          '[IdleState] Planning response received with stages, transitioning to STAGE_RUNNING'
        );
        return WorkflowEvent.START_WORKFLOW;
      }

      // Streaming format: actions array
      if (Array.isArray(apiResponse.actions)) {
        const hasPlanningAction = apiResponse.actions.some(
          (a: any) => a.type === 'plan_stage' || a.type === 'complete_workflow_planning'
        );
        if (hasPlanningAction) {
          console.log(
            '[IdleState] Planning response received with planning actions, transitioning to STAGE_RUNNING'
          );
          return WorkflowEvent.START_WORKFLOW;
        }
      }
    }

    // No valid transition condition met
    console.log('[IdleState] No transition conditions met, staying in IDLE');
    return null;
  }

  canTransitionTo(event: WorkflowEvent, _state: WorkflowState): boolean {
    const validEvents = Object.values(this.getValidTransitions());

    if (!validEvents.includes(event)) {
      return false;
    }

    // IDLE can always start workflow or fail (no additional conditions)
    if (event === WorkflowEvent.START_WORKFLOW || event === WorkflowEvent.FAIL) {
      return true;
    }

    return false;
  }

  getRequiredAPIType(): APIResponseType | null {
    // IDLE state requires Planning API to get stages
    return APIResponseType.PLANNING;
  }

  getExpectedTransitionName(): string | null {
    return 'START_WORKFLOW';
  }

  initializeFromResponse(state: WorkflowState, _apiResponse: any): WorkflowState {
    // For IDLE, initialization is handled by StartWorkflowHandler
    return state;
  }
}
