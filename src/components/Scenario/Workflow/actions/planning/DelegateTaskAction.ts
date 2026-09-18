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
      (step as any).task_description ||
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

    // --- Update Agent State FIRST (critical, should not be blocked by step lookup) ---
    if (!stateJSON.agents) {
      stateJSON.agents = {};
    }

    if (!stateJSON.agents[agent]) {
      stateJSON.agents[agent] = {
        task: { current: null, history: [] },
        thinking: { current: null, history: [] },
        conclusion: { current: null, history: [] },
      };
    }

    const agentState = stateJSON.agents[agent];

    // Archive current task if exists
    if (agentState.task.current) {
      agentState.task.history.push(agentState.task.current);
    }

    // Update current task
    agentState.task.current = task_description;

    console.log(`[DelegateTaskAction] ✅ Updated agent ${agent} state`);

    // Set current behavior context (always do this regardless of step lookup)
    if (stateJSON.observation?.location?.current) {
      stateJSON.observation.location.current.behavior_id = agent;
      stateJSON.observation.location.current.behavior = {
        agent,
        task: task_description,
        acceptance: typeof acceptance === 'string' ? acceptance : JSON.stringify(acceptance),
      };
    }

    // Update progress.behaviors.current
    // This ensures the UI reflects the current task in the behaviors section
    if (!stateJSON.observation.location.progress.behaviors.current) {
      stateJSON.observation.location.progress.behaviors.current = {
        behavior_id: agent, // Using agent as behavior_id for now
        title: `Task for ${agent}`,
        verified_artifacts: {},
        iteration: 1,
        max_iterations: 5,
        completion_status: 'running',
        agent: agent,
        task: task_description,
        inputs: {}, // Initialize inputs
        outputs: {}, // Initialize outputs
        acceptance: acceptance,
      } as any;
    } else {
      const behaviorCurrent = stateJSON.observation.location.progress.behaviors.current as any;
      behaviorCurrent.agent = agent;
      behaviorCurrent.task = task_description;
      behaviorCurrent.acceptance = acceptance;
      // Ensure inputs/outputs exist
      if (!behaviorCurrent.inputs) behaviorCurrent.inputs = {};
      if (!behaviorCurrent.outputs) behaviorCurrent.outputs = {};
    }

    // Find the current step (optional - don't block agent update if not found)
    const currentStep = stateJSON.observation.location.progress.steps.planned?.find(
      (s) => s.step_id === step_id
    );

    if (currentStep) {
      // Update step with delegation info
      currentStep.delegated_to = agent;
      currentStep.detailed_task = task_description;
      currentStep.acceptance = acceptance;
    } else {
      console.warn(
        `[DelegateTaskAction] Step not found in planned: ${step_id} (agents still updated)`
      );
    }

    console.log(`[DelegateTaskAction] ✅ Delegated step ${step_id} to ${agent}`);
    console.log(`[DelegateTaskAction] 📋 Agents in state:`, Object.keys(stateJSON.agents || {}));

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('delegate_task', DelegateTaskAction);
