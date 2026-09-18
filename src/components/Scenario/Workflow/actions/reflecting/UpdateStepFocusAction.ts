/**
 * UpdateStepFocusAction - Updates the current step's focus
 * Action Type: update-step-focus
 *
 * Used during BEHAVIOR_COMPLETED reflecting to update understanding
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class UpdateStepFocusAction extends ActionBase {
  /**
   * Handle update-step-focus action
   *
   * @param step - Execution step containing:
   *   - focus: New focus description for current step
   */
  execute(step: ExecutionStep): void {
    const focus = (step as ExecutionStep & { focus?: string }).focus;

    if (!focus) {
      console.error('[UpdateStepFocusAction] Missing focus field:', step);
      return;
    }

    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // Update steps.focus
    stateJSON.observation.location.progress.steps.focus = focus;

    console.log(`[UpdateStepFocusAction] ✅ Updated step focus: ${focus}`);

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('update-step-focus', UpdateStepFocusAction);
