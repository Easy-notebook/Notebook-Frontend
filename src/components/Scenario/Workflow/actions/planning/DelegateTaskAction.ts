/**
 * DelegateTaskAction - Delegates current step to a specific agent
 * Action Type: delegate_task
 *
 * Used during STEP_RUNNING state to assign task to an agent
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { usePipelineStore } from '../../store/usePipelineStore';

export class DelegateTaskAction extends ActionBase {
  /**
   * Handle delegate_task action - assign step to agent
   *
   * @param step - Execution step containing:
   *   - step_id: Step identifier
   *   - agent: Agent name (e.g., "WorkerAgent")
   *   - task_description: Detailed task description
   *   - acceptance: Acceptance criteria
   */
  execute(step: ExecutionStep): void {
    const { step_id, agent, task_description, acceptance } = step;

    if (!step_id || !agent || !task_description || !acceptance) {
      console.error('[DelegateTaskAction] Missing required fields:', step);
      return;
    }

    const state = usePipelineStore.getState();

    // Find the current step
    const currentStep = state.observation.location.progress.steps.planned?.find(
      (s: any) => s.step_id === step_id
    );

    if (!currentStep) {
      console.warn(`[DelegateTaskAction] Step not found: ${step_id}`);
      return;
    }

    // Update step with delegation info
    currentStep.delegated_to = agent;
    currentStep.detailed_task = task_description;
    currentStep.acceptance = acceptance;

    // Set current behavior context
    state.observation.location.current.behavior = {
      agent,
      task: task_description,
      acceptance,
    };

    console.log(`[DelegateTaskAction] ✅ Delegated step ${step_id} to ${agent}`);

    // Update pipeline store
    usePipelineStore.setState(state);
  }
}

// Register action
registerAction('delegate_task', DelegateTaskAction);
