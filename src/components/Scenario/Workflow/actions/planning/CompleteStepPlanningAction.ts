/**
 * CompleteStepPlanningAction - Marks step planning as complete
 * Action Type: complete_step_planning
 *
 * Transitions from STEP_RUNNING to BEHAVIOR_RUNNING
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { usePipelineStore } from '../../store/usePipelineStore';

export class CompleteStepPlanningAction extends ActionBase {
  /**
   * Handle complete_step_planning action
   *
   * @param step - Execution step containing:
   *   - step_id: Step identifier
   */
  execute(step: ExecutionStep): void {
    const { step_id } = step;

    if (!step_id) {
      console.error('[CompleteStepPlanningAction] Missing step_id:', step);
      return;
    }

    const state = usePipelineStore.getState();

    console.log(`[CompleteStepPlanningAction] Step planning complete: ${step_id}`);

    // Find and mark step as planning complete
    const currentStep = state.observation.location.progress.steps.planned?.find(
      (s: any) => s.step_id === step_id
    );

    if (currentStep) {
      currentStep.planning_complete = true;
    }

    // Transition to BEHAVIOR_RUNNING, ready to call /generating
    if (state.state.FSM.state === 'STEP_RUNNING') {
      state.state.FSM.state = 'BEHAVIOR_RUNNING';
      console.log('[CompleteStepPlanningAction] ✅ Transitioned to BEHAVIOR_RUNNING');
    }

    // Update pipeline store
    usePipelineStore.setState(state);
  }
}

// Register action
registerAction('complete_step_planning', CompleteStepPlanningAction);
