/**
 * DelegateTaskAction - Delegates current step to a specific agent
 * Action Type: delegate_task
 *
 * Used during STEP_RUNNING state to assign task to an agent
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

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
    // Backend sends step_id/task_description, but convertActionToExecutionStep converts to stepId/taskDescription
    const step_id = step.stepId || step.step_id;
    const task_description =
      (step as ExecutionStep & { taskDescription?: string }).taskDescription ||
      (step.metadata?.task_description as string | undefined);
    const agent = (step as ExecutionStep & { agent?: string }).agent;
    const acceptance = step.acceptance;

    if (!step_id || !agent || !task_description || !acceptance) {
      console.error('[DelegateTaskAction] Missing required fields:', step);
      return;
    }

    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // Find the current step
    const currentStep = stateJSON.observation.location.progress.steps.planned?.find(
      (s) => s.step_id === step_id
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
    stateJSON.observation.location.current.behavior = {
      agent,
      task: task_description,
      acceptance,
    };

    console.log(`[DelegateTaskAction] ✅ Delegated step ${step_id} to ${agent}`);

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('delegate_task', DelegateTaskAction);
