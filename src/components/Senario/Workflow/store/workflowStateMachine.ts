/**
 * Workflow State Machine & Executor - Final Integrated Version
 *
 * This single file contains both the finite state machine for managing workflow state
 * and the executor responsible for carrying out the actual work of each step,
 * such as making API calls and running actions. This co-location simplifies the
 * architecture by centralizing the entire workflow lifecycle logic.
 *
 * Responsibilities:
 * 1.  WorkflowStateMachine: The "Commander". Manages states (IDLE, STEP_EXECUTING, etc.)
 * and transitions based on events. It decides *what* to do and *when*.
 *
 * 2.  WorkflowExecutor: The "Worker". Executes the commands from the state machine.
 * It knows *how* to perform tasks like fetching actions from the sequence API,
 * managing an action queue, and executing individual actions.
 *
 * Core Flow:
 * - State machine transitions to STEP_EXECUTING.
 * - Its side effect calls the WorkflowExecutor to start a new behaviour.
 * - The executor fetches actions, queues them, and executes them sequentially.
 * - When the executor finishes all actions for a behaviour, it notifies the state machine.
 * - The state machine transitions to STEP_FEEDBACK.
 * - Its side effect calls the feedback API to get the next command.
 * - It parses the command and transitions to the next appropriate state, creating a loop.
 *
 * @author Hu Silan (Integrated by Gemini AI based on user feedback)
 * @project Easy-notebook
 * @file workflowStateMachine.ts
 */
import { create } from 'zustand';
import workflowAPIClient from '../services/WorkflowAPIClient.js';
import constants from '../services/constants.js';
import { useScriptStore } from './useScriptStore.js'; // Executor dependency
// @ts-ignore
import { useAIPlanningContextStore } from './aiPlanningContext.js'; // Executor dependency
import { usePipelineStore } from './usePipelineStore.js';
import { useWorkflowPanelStore } from '../../../Notebook/store/workflowPanelStore.js';

// ==============================================
// Types and Interfaces
// ==============================================

export interface WorkflowStep {
    step_id: string;
    id?: string;
    status?: string;
    title?: string;
    description?: string;
    index?: number;
}

export interface WorkflowStage {
    id: string;
    title?: string;
    description?: string;
    steps: WorkflowStep[];
}

export interface WorkflowTemplate {
    name: string;
    stages: WorkflowStage[];
}

export interface ExecutionHistoryEntry {
    timestamp: number;
    fromState: string;
    toState: string;
    event: string;
    payload: any;
    hierarchicalId?: string | null;
    stageId?: string | null;
    stepId?: string | null;
    stepIndex?: number;
    behaviourCounter?: number;
    actionCounter?: number;
}

export interface StepResult {
    status: string;
    reason?: string;
    error?: string;
    timestamp?: string;
    result?: any;
}

// ==============================================
// Constants (Refactored)
// ==============================================

export const WORKFLOW_STATES = {
    // start
    IDLE: 'idle',
    // Stage
    STAGE_RUNNING: 'stage_running',
    STAGE_COMPLETED: 'stage_completed',
    // Step
    STEP_RUNNING: 'step_running',
    STEP_COMPLETED: 'step_completed',
    // Behavior
    BEHAVIOR_RUNNING: 'behavior_running',
    BEHAVIOR_COMPLETED: 'behavior_completed',
    // Action
    ACTION_RUNNING: 'action_running',
    ACTION_COMPLETED: 'action_completed',
    // Workflow
    WORKFLOW_COMPLETED: 'workflow_completed',
    WORKFLOW_UPDATE_PENDING: 'workflow_update_pending',
    STEP_UPDATE_PENDING: 'step_update_pending',
    // General
    ERROR: 'error',
    CANCELLED: 'cancelled',
} as const;

export type WorkflowState = typeof WORKFLOW_STATES[keyof typeof WORKFLOW_STATES];

export const EVENTS = {
    // ==============================================
    // 1. Lifecycle: START Events
    // ==============================================

    /**
     * @description Starts the entire workflow.
     * @transition IDLE -> STAGE_RUNNING
     */
    START_WORKFLOW: 'START_WORKFLOW',

    /**
     * @description Starts the next step within the current stage.
     * @transition STAGE_RUNNING -> STEP_RUNNING
     */
    START_STEP: 'START_STEP',

    /**
     * @description Starts the next behavior within the current step.
     * @transition STEP_RUNNING -> BEHAVIOR_RUNNING
     */
    START_BEHAVIOR: 'START_BEHAVIOR',

    /**
     * @description Starts the next action within the current behavior.
     * @transition BEHAVIOR_RUNNING -> ACTION_RUNNING
     */
    START_ACTION: 'START_ACTION',

    // ==============================================
    // 2. Lifecycle: COMPLETE Events
    // ==============================================

    /**
     * @description Declares the current action has finished.
     * @transition ACTION_RUNNING -> BEHAVIOR_RUNNING (to decide next action or finish)
     */
    COMPLETE_ACTION: 'COMPLETE_ACTION',

    /**
     * @description Declares the current behavior has completed execution and feedback, ready for next step.
     * @transition BEHAVIOR_RUNNING -> BEHAVIOR_COMPLETED (after feedback evaluation)
     */
    COMPLETE_BEHAVIOR: 'COMPLETE_BEHAVIOR',

    /**
     * @description Declares the current step has finished all its behaviors.
     * @transition STEP_RUNNING -> STEP_COMPLETED
     */
    COMPLETE_STEP: 'COMPLETE_STEP',

    /**
     * @description Declares the current stage has finished all its steps.
     * @transition STAGE_RUNNING -> STAGE_COMPLETED
     */
    COMPLETE_STAGE: 'COMPLETE_STAGE',

    /**
     * @description Declares the final stage is complete, finishing the workflow.
     * @transition STAGE_COMPLETED -> WORKFLOW_COMPLETED
     */
    COMPLETE_WORKFLOW: 'COMPLETE_WORKFLOW',


    // ==============================================
    // 3. Feedback & Looping Events
    // ==============================================
    /**
     * @description After a behavior is completed, this starts the next behavior in the same step.
     * @transition ACTION_COMPLETED -> ACTION_RUNNING
     */
    NEXT_ACTION: 'NEXT_ACTION',

    /**
     * @description After a behavior is completed, this starts the next behavior in the same step.
     * @transition BEHAVIOR_COMPLETED -> BEHAVIOR_RUNNING
     */
    NEXT_BEHAVIOR: 'NEXT_BEHAVIOR',

    /**
     * @description After a behavior is completed, this starts the next behavior in the same step.
     * @transition STEP_COMPLETED -> STEP_RUNNING
     */
    NEXT_STEP: 'NEXT_STEP',

    /**
     * @description After a step is completed, this starts the next stage (auto-advance).
     * @transition STEP_COMPLETED -> STAGE_RUNNING
     */
    NEXT_STAGE: 'NEXT_STAGE',

    // ==============================================
    // 4. Update Events
    // ==============================================

    /**
     * @description Requests a full workflow update.
     * @transition any_running_state -> WORKFLOW_UPDATE_PENDING
     */
    UPDATE_WORKFLOW: 'UPDATE_WORKFLOW',

    /**
     * @description Confirms the workflow update, returning to action completed state.
     * @transition WORKFLOW_UPDATE_PENDING -> ACTION_COMPLETED
     */
    UPDATE_WORKFLOW_CONFIRMED: 'UPDATE_WORKFLOW_CONFIRMED',

    /**
     * @description Rejects the workflow update, returning to action completed state.
     * @transition WORKFLOW_UPDATE_PENDING -> ACTION_COMPLETED
     */
    UPDATE_WORKFLOW_REJECTED: 'UPDATE_WORKFLOW_REJECTED',

    /**
     * @description Requests an update to the steps of a stage.
     * @transition any_running_state -> STEP_UPDATE_PENDING
     */
    UPDATE_STEP: 'UPDATE_STEP',

    /**
     * @description Confirms the step update.
     * @transition STEP_UPDATE_PENDING -> (previous_state)
     */
    UPDATE_STEP_CONFIRMED: 'UPDATE_STEP_CONFIRMED',

    /**
     * @description Rejects the step update.
     * @transition STEP_UPDATE_PENDING -> (previous_state)
     */
    UPDATE_STEP_REJECTED: 'UPDATE_STEP_REJECTED',

    // ==============================================
    // 5. General Control Events
    // ==============================================

    /**
     * @description A non-recoverable error occurred.
     * @transition * -> ERROR
     */
    FAIL: 'FAIL',

    /**
     * @description The user or system cancels the workflow.
     * @transition * -> CANCELLED
     */
    CANCEL: 'CANCEL',

    /**
     * @description Resets the machine from a terminal state.
     * @transition WORKFLOW_COMPLETED | ERROR | CANCELLED -> IDLE
     */
    RESET: 'RESET',
};

export type WorkflowEvent = typeof EVENTS[keyof typeof EVENTS];

// State transition rules (Refactored)
const STATE_TRANSITIONS: Record<WorkflowState, Partial<Record<WorkflowEvent, WorkflowState>>> = {
    /**
     * The machine is idle, waiting for the workflow to begin.
     */
    [WORKFLOW_STATES.IDLE]: {
        [EVENTS.START_WORKFLOW]: WORKFLOW_STATES.STAGE_RUNNING,
    },

    /**
     * A stage is active, ready to execute its steps.
     */
    [WORKFLOW_STATES.STAGE_RUNNING]: {
        [EVENTS.START_STEP]: WORKFLOW_STATES.STEP_RUNNING,
        [EVENTS.COMPLETE_STAGE]: WORKFLOW_STATES.STAGE_COMPLETED,
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED
    },

    /**
     * A step is active, ready to execute its behaviors.
     */
    [WORKFLOW_STATES.STEP_RUNNING]: {
        [EVENTS.START_BEHAVIOR]: WORKFLOW_STATES.BEHAVIOR_RUNNING,
        [EVENTS.COMPLETE_STEP]: WORKFLOW_STATES.STEP_COMPLETED,
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * A behavior is active, managing the execution of its actions. This is the main action loop.
     */
    [WORKFLOW_STATES.BEHAVIOR_RUNNING]: {
        [EVENTS.START_ACTION]: WORKFLOW_STATES.ACTION_RUNNING,
        [EVENTS.COMPLETE_BEHAVIOR]: WORKFLOW_STATES.BEHAVIOR_COMPLETED,
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * A single, atomic action is being executed.
     */
    [WORKFLOW_STATES.ACTION_RUNNING]: {
        // Corrected: Upon completion, an action moves to the ACTION_COMPLETED state.
        [EVENTS.COMPLETE_ACTION]: WORKFLOW_STATES.ACTION_COMPLETED,
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
        [EVENTS.UPDATE_WORKFLOW]: WORKFLOW_STATES.WORKFLOW_UPDATE_PENDING,
        [EVENTS.UPDATE_STEP]: WORKFLOW_STATES.STEP_UPDATE_PENDING,
    },

    /**
     * An action has just completed. The machine is waiting for the next command
     * from the parent behavior: either start the next action or finish.
     */
    [WORKFLOW_STATES.ACTION_COMPLETED]: {
        [EVENTS.NEXT_ACTION]: WORKFLOW_STATES.ACTION_RUNNING,
        [EVENTS.COMPLETE_BEHAVIOR]: WORKFLOW_STATES.BEHAVIOR_COMPLETED,
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * A behavior has successfully completed after passing feedback.
     */
    [WORKFLOW_STATES.BEHAVIOR_COMPLETED]: {
        [EVENTS.NEXT_BEHAVIOR]: WORKFLOW_STATES.BEHAVIOR_RUNNING, // Start the next behavior in the same step
        [EVENTS.COMPLETE_STEP]: WORKFLOW_STATES.STEP_COMPLETED,   // Step is considered completed after behavior finished
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * A step has successfully completed all its behaviors.
     */
    [WORKFLOW_STATES.STEP_COMPLETED]: {
        [EVENTS.COMPLETE_STAGE]: WORKFLOW_STATES.STAGE_COMPLETED, // Stage is completed when step is done
        [EVENTS.NEXT_STEP]: WORKFLOW_STATES.STEP_RUNNING,
        [EVENTS.FAIL]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * A stage has successfully completed all its steps.
     */
    [WORKFLOW_STATES.STAGE_COMPLETED]: {
        [EVENTS.NEXT_STAGE]: WORKFLOW_STATES.STAGE_RUNNING,             // Start the first step of the next stage
        [EVENTS.COMPLETE_WORKFLOW]: WORKFLOW_STATES.WORKFLOW_COMPLETED, // This was the last stage
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * The entire workflow has finished successfully.
     */
    [WORKFLOW_STATES.WORKFLOW_COMPLETED]: {
        [EVENTS.RESET]: WORKFLOW_STATES.IDLE,
    },
    
    /**
     * Waiting for user confirmation on a major workflow update.
     */
    [WORKFLOW_STATES.WORKFLOW_UPDATE_PENDING]: {
        [EVENTS.UPDATE_WORKFLOW_CONFIRMED]: WORKFLOW_STATES.ACTION_COMPLETED,
        [EVENTS.UPDATE_WORKFLOW_REJECTED]: WORKFLOW_STATES.ACTION_COMPLETED,
        [EVENTS.COMPLETE_ACTION]: WORKFLOW_STATES.WORKFLOW_UPDATE_PENDING, // Ignore action completion while waiting for user
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * Waiting for user confirmation on a minor step update.
     */
    [WORKFLOW_STATES.STEP_UPDATE_PENDING]: {
        [EVENTS.UPDATE_STEP_CONFIRMED]: WORKFLOW_STATES.ACTION_COMPLETED,
        [EVENTS.UPDATE_STEP_REJECTED]: WORKFLOW_STATES.ERROR,
        [EVENTS.CANCEL]: WORKFLOW_STATES.CANCELLED,
    },

    /**
     * A terminal error state.
     */
    [WORKFLOW_STATES.ERROR]: {
        [EVENTS.RESET]: WORKFLOW_STATES.IDLE,
        [EVENTS.START_WORKFLOW]: WORKFLOW_STATES.STAGE_RUNNING,
        [EVENTS.START_BEHAVIOR]: WORKFLOW_STATES.BEHAVIOR_RUNNING,
    },

    /**
     * A terminal cancelled state.
     */
    [WORKFLOW_STATES.CANCELLED]: {
        [EVENTS.RESET]: WORKFLOW_STATES.IDLE,
    },
};


// ==============================================
// 3. TYPES & INTERFACES
// ==============================================

interface FeedbackResponse {
    targetAchieved: boolean;
    stepCompleted?: boolean;
    nextBehaviorId?: string;
}

interface WorkflowContext {
    currentStageId: string | null;
    currentStepId: string | null;
    currentBehaviorId: string | null;
    currentBehaviorActions: any[];
    currentActionIndex: number;
}

interface PendingUpdateData {
    workflowTemplate: any;
    nextStageId?: string;
}

interface WorkflowStateMachineState {
    currentState: WorkflowState;
    context: WorkflowContext;
    executionHistory: any[];
    pendingWorkflowData: PendingUpdateData | null;
}

interface WorkflowStateMachineActions {
    transition: (event: WorkflowEvent, payload?: any) => void;
    startWorkflow: (initialContext: { stageId: string, stepId: string }) => void;
    fail: (error: Error, message?: string) => void;
    cancel: () => void;
    reset: () => void;
    requestWorkflowUpdate: (payload: PendingUpdateData) => void;
    confirmWorkflowUpdate: () => void;
    rejectWorkflowUpdate: () => void;
}

export type WorkflowStateMachine = WorkflowStateMachineState & WorkflowStateMachineActions;

// ==============================================
// 4. STATE EFFECTS (The Engine Logic)
// ==============================================

async function executeStateEffects(state: WorkflowState, payload: any) {
    const { transition, context } = useWorkflowStateMachine.getState();
    const { execAction } = useScriptStore.getState();
    const { getContext } = useAIPlanningContextStore.getState();

    console.log(`[FSM Effect] Executing for state: ${state}`, { context, payload });

 /**
     * Updates the context pointers to the next step or stage.
     * It handles advancing the `currentStageId` or `currentStepId` in the state machine's context,
     * resetting lower-level context appropriately.
     * @param {'step' | 'stage'} level - The level to advance.
     */
 const move2Next = (level: 'step' | 'stage') => {
    const { context, fail } = useWorkflowStateMachine.getState();
    const { workflowTemplate } = usePipelineStore.getState();

    // Guard against missing workflow data, which is a critical error.
    if (!workflowTemplate?.stages?.length) {
        console.error("[move2Next] Aborted: Workflow template or stages are missing.");
        fail(new Error("Workflow template not loaded"), "Cannot advance to the next item.");
        return;
    }

    if (level === 'stage') {
        const stages = workflowTemplate.stages;
        const currentStageIndex = stages.findIndex(s => s.id === context.currentStageId);

        if (currentStageIndex === -1) {
            console.error(`[move2Next] Failed to find current stage with ID: '${context.currentStageId}'. This indicates a state inconsistency.`);
            fail(new Error(`Stage not found: ${context.currentStageId}`), "Inconsistent state detected.");
            return;
        }

        // Check if it's already the last stage.
        if (currentStageIndex >= stages.length - 1) {
            console.log(`[move2Next] Already at the last stage ('${context.currentStageId}'). The workflow should now complete.`);
            // The calling logic (e.g., in STAGE_COMPLETED effect) will handle transitioning to COMPLETE_WORKFLOW.
            return;
        }

        // Correctly get the next stage.
        const nextStage = stages[currentStageIndex + 1];
        const firstStepId = nextStage.steps?.[0]?.id || null;
        
        console.log(`[move2Next] Advancing from stage '${context.currentStageId}' to '${nextStage.id}'.`);

        useWorkflowStateMachine.setState(s => ({
            context: {
                ...s.context,
                currentStageId: nextStage.id,
                currentStepId: firstStepId, // Reset to the first step of the new stage
                currentBehaviorActions: [],
                currentActionIndex: 0,
            }
        }));

    } else if (level === 'step') {
        const currentStage = workflowTemplate.stages.find(s => s.id === context.currentStageId);

        if (!currentStage || !currentStage.steps?.length) {
            console.error(`[move2Next] Failed to find current stage ('${context.currentStageId}') or it contains no steps.`);
            fail(new Error(`Stage not found or is empty: ${context.currentStageId}`), "Inconsistent state detected.");
            return;
        }

        const steps = currentStage.steps;
        // Use a robust check for the current step index, looking at both id and step_id.
        const currentStepIndex = steps.findIndex(st => st.id === context.currentStepId || st.step_id === context.currentStepId);

        if (currentStepIndex === -1) {
            console.error(`[move2Next] Failed to find current step with ID: '${context.currentStepId}' in stage '${currentStage.id}'.`);
            fail(new Error(`Step not found: ${context.currentStepId}`), "Inconsistent state detected.");
            return;
        }

        // Check if it's already the last step of the current stage.
        if (currentStepIndex >= steps.length - 1) {
            console.log(`[move2Next] Already at the last step ('${context.currentStepId}') of stage '${currentStage.id}'.`);
            // The calling logic (e.g., in STEP_COMPLETED effect) will handle transitioning to COMPLETE_STAGE.
            return;
        }

        // Correctly get the next step.
        const nextStep = steps[currentStepIndex + 1];
        
        console.log(`[move2Next] Advancing from step '${context.currentStepId}' to '${nextStep.id}'.`);

        useWorkflowStateMachine.setState(s => ({
            context: {
                ...s.context,
                currentStepId: nextStep.id, // Set the new step ID
                currentBehaviorActions: [], // Reset behavior context
                currentActionIndex: 0,
            }
        }));
    }
};
    try {
        switch (state) {
            case WORKFLOW_STATES.STAGE_RUNNING: {
                const pipeline = usePipelineStore.getState();
                const stage = pipeline.workflowTemplate?.stages.find(s => s.id === context.currentStageId);
                const firstStepId = stage?.steps[0]?.id;

                if (firstStepId) {
                    useWorkflowStateMachine.setState(s => ({ context: { ...s.context, currentStepId: firstStepId } }));
                    transition(EVENTS.START_STEP);
                } else {
                    transition(EVENTS.FAIL, { error: new Error(`No steps found in stage ${context.currentStageId}`) });
                }
                break;
            }

            case WORKFLOW_STATES.STEP_RUNNING: {
                transition(EVENTS.START_BEHAVIOR);
                break;
            }

            // BEHAVIOR_RUNNING: Fetch actions and start first action
            case WORKFLOW_STATES.BEHAVIOR_RUNNING: {
                const response = await fetch(constants.API.BEHAVIOR_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stage_id: context.currentStageId,
                        step_index: context.currentStepId,
                        state: getContext(),
                        stream: true,
                    }),
                });
                if (!response.ok) throw new Error(`Sequence API failed: ${response.status}`);

                const reader = response.body!.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";
                const actions: any[] = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.trim()) {
                            const message = JSON.parse(line);
                            if (message.action) {
                                actions.push(message.action);
                            }
                        }
                    }
                }

                console.log(`[FSM Effect] Fetched ${actions.length} actions.`);
                useWorkflowStateMachine.setState(s => ({ context: { ...s.context, currentBehaviorActions: actions, currentActionIndex: 0 } }));
                if (actions.length > 0) {
                    transition(EVENTS.START_ACTION);
                } else {
                    transition(EVENTS.COMPLETE_BEHAVIOR);
                }
                break;
            }

            // ACTION_RUNNING: Execute the current action
            case WORKFLOW_STATES.ACTION_RUNNING: {
                const currentAction = context.currentBehaviorActions[context.currentActionIndex];
                console.log(`[FSM Effect] Executing action #${context.currentActionIndex + 1}:`, currentAction.action);
                await execAction(currentAction);
                transition(EVENTS.COMPLETE_ACTION);
                break;
            }

            // ACTION_COMPLETED: Decide whether to execute next action or complete behavior
            case WORKFLOW_STATES.ACTION_COMPLETED: {
                // Normal action completion flow
                const nextActionIndex = context.currentActionIndex + 1;
                if (nextActionIndex < context.currentBehaviorActions.length) {
                    // More actions to execute - update index and trigger NEXT_ACTION
                    useWorkflowStateMachine.setState(s => ({ context: { ...s.context, currentActionIndex: nextActionIndex } }));
                    transition(EVENTS.NEXT_ACTION);
                } else {
                    transition(EVENTS.COMPLETE_BEHAVIOR);
                }
                break;
            }

            // BEHAVIOR_COMPLETED: Send feedback and decide next action based on response
            case WORKFLOW_STATES.BEHAVIOR_COMPLETED: {
                try {
                    const feedbackResponse: FeedbackResponse = await workflowAPIClient.sendFeedback({
                        stage_id: context.currentStageId!,
                        step_index: context.currentStepId!,
                        state: getContext() || {},
                    });

                    console.log(`[FSM Effect] BEHAVIOR_COMPLETED: Feedback response received:`, feedbackResponse);

                    if (feedbackResponse.targetAchieved) {
                        transition(EVENTS.COMPLETE_STEP);
                    } else {
                        transition(EVENTS.NEXT_BEHAVIOR);
                    }
                } catch (error) {
                    console.error(`[FSM Effect] BEHAVIOR_COMPLETED: Error getting feedback:`, error);
                    transition(EVENTS.FAIL, { error: `Feedback request failed: ${error.message}` });
                }
                break;
            }

            // STEP_COMPLETED: Decide next step or complete stage
            case WORKFLOW_STATES.STEP_COMPLETED: {
                // Check if this is the last step in the current stage
                const pipeline = usePipelineStore.getState();
                const stages = pipeline.workflowTemplate?.stages;

                // 添加防护检查
                if (!stages || !Array.isArray(stages) || !context.currentStageId) {
                    console.error('[FSM Effect] Invalid stages or currentStageId in STEP_COMPLETED state');
                    break;
                }

                const currentStage = stages.find(s => s.id === context.currentStageId);
                if (!currentStage?.steps || !Array.isArray(currentStage.steps)) {
                    console.error('[FSM Effect] Invalid currentStage or steps in STEP_COMPLETED state');
                    break;
                }

                const currentStepIndex = currentStage.steps.findIndex(step => step.id === context.currentStepId) ?? -1;
                const isLastStep = currentStepIndex === (currentStage.steps.length - 1);

                if (isLastStep) {
                    transition(EVENTS.COMPLETE_STAGE);
                } else {
                    move2Next('step');
                    transition(EVENTS.NEXT_STEP);
                }
                break;
            }

            // STAGE_COMPLETED: Decide next stage or complete workflow
            case WORKFLOW_STATES.STAGE_COMPLETED: {
                const pipeline = usePipelineStore.getState();
                const currentStageIndex = pipeline.workflowTemplate?.stages.findIndex(s => s.id === context.currentStageId) ?? -1;
                const isLastStage = currentStageIndex === (pipeline.workflowTemplate?.stages.length ?? 0) - 1;

                if (isLastStage) {
                    transition(EVENTS.COMPLETE_WORKFLOW);
                } else {
                    move2Next('stage');
                    transition(EVENTS.NEXT_STAGE);
                }
                break;
            }

            // Terminal states don't need side effects
            case WORKFLOW_STATES.WORKFLOW_COMPLETED:
            case WORKFLOW_STATES.ERROR:
            case WORKFLOW_STATES.CANCELLED:
                // No side effects for terminal states
                break;

            // Pending states don't need automatic side effects
            case WORKFLOW_STATES.WORKFLOW_UPDATE_PENDING:
            case WORKFLOW_STATES.STEP_UPDATE_PENDING:
                // These states wait for user confirmation
                break;

            default:
                console.warn(`[FSM Effect] No side effects defined for state: ${state}`);
        }
    } catch (error) {
        console.error(`[FSM Effect] Unhandled error in state ${state}:`, error);
        useWorkflowStateMachine.getState().transition(EVENTS.FAIL, { error: error instanceof Error ? error.message : String(error) });
    }
}

// ==============================================
// 5. ZUSTAND STORE DEFINITION
// ==============================================

export const useWorkflowStateMachine = create<WorkflowStateMachine>((set, get) => ({
    currentState: WORKFLOW_STATES.IDLE,
    context: {
        currentStageId: null,
        currentStepId: null,
        currentBehaviorId: null,
        currentBehaviorActions: [],
        currentActionIndex: 0,
    },
    executionHistory: [],
    pendingWorkflowData: null,

    transition: (event, payload = {}) => {
        const fromState = get().currentState;
        const toState = STATE_TRANSITIONS[fromState]?.[event];
        if (!toState) {
            console.warn(`[FSM] Invalid transition: From ${fromState} via ${event}`);
            return;
        }
        console.log(`[FSM] Transition: ${fromState} -> ${toState} (Event: ${event})`, payload);

        set(state => {
            const newState = {
                executionHistory: [...state.executionHistory, { from: fromState, to: toState, event, payload, timestamp: new Date() }],
                currentState: toState
            };

            // Store pending workflow data when transitioning to UPDATE_PENDING
            if (event === EVENTS.UPDATE_WORKFLOW && payload) {
                newState.pendingWorkflowData = payload;

                // Also set UI state to show confirmation dialog
                const workflowPanelStore = useWorkflowPanelStore.getState();
                workflowPanelStore.setPendingWorkflowUpdate(payload);
                workflowPanelStore.setShowWorkflowConfirm(true);
            }

            // Handle workflow update confirmation/rejection
            if (event === EVENTS.UPDATE_WORKFLOW_CONFIRMED) {
                // Apply workflow update from state machine's own pending data
                const currentPendingData = state.pendingWorkflowData;
                if (currentPendingData?.workflowTemplate) {
                    console.log('[FSM] Applying confirmed workflow update to pipeline:', currentPendingData.workflowTemplate.name);
                    const pipeline = usePipelineStore.getState();
                    pipeline.setWorkflowTemplate(currentPendingData.workflowTemplate);

                    // Update current stage/step context if nextStageId is provided
                    if (currentPendingData.nextStageId) {
                        newState.context = {
                            ...state.context,
                            currentStageId: currentPendingData.nextStageId,
                            currentStepId: null
                        };
                    } else {
                        // Verify if current stage still exists in the new workflow
                        const newWorkflowStages = currentPendingData.workflowTemplate.stages || [];
                        const currentStageExists = newWorkflowStages.some(stage => stage.id === state.context.currentStageId);

                        if (!currentStageExists && newWorkflowStages.length > 0) {
                            // Current stage doesn't exist in new workflow, switch to first stage
                            const firstStage = newWorkflowStages[0];
                            const firstStepId = firstStage.steps && firstStage.steps.length > 0 ? firstStage.steps[0].id : null;

                            console.log(`[FSM] Current stage ${state.context.currentStageId} not found in new workflow, switching to first stage: ${firstStage.id} with first step: ${firstStepId}`);
                            newState.context = {
                                ...state.context,
                                currentStageId: firstStage.id,
                                currentStepId: firstStepId
                            };
                        }
                    }

                    console.log('[FSM] Workflow update applied successfully to pipeline store');
                } else {
                    console.warn('[FSM] No pending workflow data found when confirming update');
                }

                // Clear pending workflow data and UI state after applying
                newState.pendingWorkflowData = null;
                const workflowPanelStore = useWorkflowPanelStore.getState();
                workflowPanelStore.setPendingWorkflowUpdate(null);
                workflowPanelStore.setShowWorkflowConfirm(false);
            } else if (event === EVENTS.UPDATE_WORKFLOW_REJECTED) {
                // Clear pending workflow data and UI state when rejected
                console.log('[FSM] Workflow update rejected, clearing pending data');
                newState.pendingWorkflowData = null;
                const workflowPanelStore = useWorkflowPanelStore.getState();
                workflowPanelStore.setPendingWorkflowUpdate(null);
                workflowPanelStore.setShowWorkflowConfirm(false);
            }

            return newState;
        });

        setTimeout(() => executeStateEffects(toState, payload), 0);
    },

    startWorkflow: (initialContext) => {
        set({
            context: {
                currentStageId: initialContext.stageId,
                currentStepId: null, // Start with stage, step will be determined by effect
                currentBehaviorId: null,
                currentBehaviorActions: [],
                currentActionIndex: 0,
            }
        });
        get().transition(EVENTS.START_WORKFLOW);
    },

    fail: (error, message) => get().transition(EVENTS.FAIL, { error, message }),
    cancel: () => get().transition(EVENTS.CANCEL),
    reset: () => {
        set({
            currentState: WORKFLOW_STATES.IDLE,
            context: { currentStageId: null, currentStepId: null, currentBehaviorId: null, currentBehaviorActions: [], currentActionIndex: 0 },
            executionHistory: [],
            pendingWorkflowData: null,
        });
    },

    requestWorkflowUpdate: (payload) => get().transition(EVENTS.UPDATE_WORKFLOW, payload),
    confirmWorkflowUpdate: () => get().transition(EVENTS.UPDATE_WORKFLOW_CONFIRMED),
    rejectWorkflowUpdate: () => get().transition(EVENTS.UPDATE_WORKFLOW_REJECTED),
}));