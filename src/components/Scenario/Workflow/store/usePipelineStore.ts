/**
 * @file usePipelineStore.ts
 * @description Pipeline Store for managing workflow template structure and execution state.
 *
 * Ported from: ref/Notebook-BCC/stores/pipeline_store.py
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Responsibilities:
 * - Manages workflow template (WorkflowTemplate with stages and steps)
 * - Handles workflow activation state
 * - Provides initialization and reset functionality
 * - NO business logic - only data management
 *
 * Architecture:
 * - Pure data store (no FSM logic)
 * - WorkflowStateMachine handles execution flow
 * - TransitionHandlers handle state updates
 * - ScriptStore handles action execution
 *
 * @author Hu Silan
 * @project Easy-notebook
 */

import { create } from 'zustand';

// ==============================================
// TYPES & INTERFACES
// ==============================================

/**
 * Pre-stage enum (for UI state before workflow starts)
 */
export const PIPELINE_STAGES = {
  EMPTY: 'EMPTY',
  PROBLEM_DEFINE: 'PROBLEM_DEFINE',
} as const;

export type PreStage = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  step_id: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Workflow stage definition
 */
export interface WorkflowStage {
  id: string;
  title: string;
  description: string;
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

/**
 * Complete workflow template structure
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  metadata?: Record<string, any>;
}

/**
 * Planning request structure
 */
export interface PlanningRequest {
  problem?: string;
  description?: string;
  requirements?: string;
  [key: string]: any;
}

// ==============================================
// STORE STATE & ACTIONS
// ==============================================

/**
 * Pipeline store state
 */
interface PipelineStoreState {
  // The complete workflow template
  workflowTemplate: WorkflowTemplate | null;

  // Workflow activation flag
  isWorkflowActive: boolean;

  // UI-related pre-workflow states (for backward compatibility)
  currentPreStage: PreStage;
  isAnimating: boolean;
  animationDirection: 'forward' | 'backward';
}

/**
 * Pipeline store actions
 */
interface PipelineStoreActions {
  // ==============================================
  // Workflow Template Management
  // ==============================================

  /**
   * Set the workflow template
   */
  setWorkflowTemplate: (template: WorkflowTemplate) => void;

  /**
   * Get the workflow template
   */
  getWorkflowTemplate: () => WorkflowTemplate | null;

  /**
   * Update steps for a specific stage
   */
  updateStepsForStage: (stageId: string, newSteps: WorkflowStep[]) => void;

  // ==============================================
  // Workflow Activation
  // ==============================================

  /**
   * Set workflow active state
   */
  setWorkflowActive: (active: boolean) => void;

  /**
   * Check if workflow is active
   */
  isActive: () => boolean;

  // ==============================================
  // UI State (Pre-workflow)
  // ==============================================

  /**
   * Set pre-stage UI state
   */
  setPreStage: (stage: PreStage) => void;

  /**
   * Toggle animation flags
   */
  setAnimation: (isAnimating: boolean, direction?: 'forward' | 'backward') => void;

  // ==============================================
  // Initialization
  // ==============================================

  /**
   * Initialize workflow with a predefined template.
   *
   * This creates a minimal template structure. The actual workflow
   * stages and steps will be populated by the planning API.
   *
   * @param planningRequest - Planning request data
   * @returns The initialized workflow template
   */
  initializeWorkflow: (planningRequest: PlanningRequest) => Promise<WorkflowTemplate>;

  /**
   * Start workflow execution.
   *
   * This marks the workflow as active and triggers the state machine
   * to begin execution.
   */
  startWorkflowExecution: (userData?: {
    user_problem?: string;
    user_submit_files?: string[];
    context_description?: string;
  }) => void;

  // ==============================================
  // Reset
  // ==============================================

  /**
   * Reset the store to initial state
   */
  reset: () => void;
}

/**
 * Complete store type
 */
export type PipelineStore = PipelineStoreState & PipelineStoreActions;

// ==============================================
// INITIAL STATE
// ==============================================

const initialState: PipelineStoreState = {
  workflowTemplate: null,
  isWorkflowActive: false,
  currentPreStage: 'EMPTY',
  isAnimating: false,
  animationDirection: 'forward',
};

// ==============================================
// ZUSTAND STORE
// ==============================================

/**
 * Pipeline Store - Manages workflow template structure
 *
 * This store acts as the blueprint repository for the workflow.
 * The WorkflowStateMachine reads from this store to understand
 * the sequence of stages and steps to execute.
 */
export const usePipelineStore = create<PipelineStore>((set, get) => ({
  // ==============================================
  // State
  // ==============================================
  ...initialState,

  // ==============================================
  // Workflow Template Management
  // ==============================================

  setWorkflowTemplate: (template: WorkflowTemplate) => {
    console.log('[PipelineStore] Setting workflow template:', template.name);
    set({ workflowTemplate: template });
  },

  getWorkflowTemplate: () => {
    return get().workflowTemplate;
  },

  updateStepsForStage: (stageId: string, newSteps: WorkflowStep[]) => {
    const { workflowTemplate } = get();

    if (!workflowTemplate) {
      console.warn(`[PipelineStore] Cannot update steps: no workflow template`);
      return;
    }

    const updatedStages = workflowTemplate.stages.map((stage) =>
      stage.id === stageId ? { ...stage, steps: newSteps } : stage
    );

    set({
      workflowTemplate: {
        ...workflowTemplate,
        stages: updatedStages,
      },
    });

    console.log(`[PipelineStore] Updated ${newSteps.length} steps for stage: ${stageId}`);
  },

  // ==============================================
  // Workflow Activation
  // ==============================================

  setWorkflowActive: (active: boolean) => {
    set({ isWorkflowActive: active });
    console.log(`[PipelineStore] Workflow active: ${active}`);
  },

  isActive: () => {
    return get().isWorkflowActive;
  },

  // ==============================================
  // UI State (Pre-workflow)
  // ==============================================

  setPreStage: (stage: PreStage) => {
    console.log(`[PipelineStore] Setting pre-stage: ${stage}`);
    set({ currentPreStage: stage });
  },

  setAnimation: (isAnimating: boolean, direction: 'forward' | 'backward' = 'forward') => {
    set({ isAnimating, animationDirection: direction });
  },

  // ==============================================
  // Initialization
  // ==============================================

  initializeWorkflow: async (planningRequest: PlanningRequest) => {
    console.log('[PipelineStore] Initializing workflow with request:', planningRequest);

    try {
      // Create predefined workflow template
      // This matches the backend structure in pipeline_store.py
      const workflowTemplate: WorkflowTemplate = {
        id: 'dcls_workflow',
        name: 'Data Science Lifecycle (DCLS) Analysis',
        description: 'Complete data science workflow based on existence first principles',
        stages: [
          {
            id: 'chapter_0_planning',
            title: 'Planning & Analysis',
            description: 'Initial problem analysis and workflow planning',
            steps: [
              {
                id: 'chapter_0_planning_section_1_design_workflow',
                step_id: 'chapter_0_planning_section_1_design_workflow',
                title: 'Design Workflow',
                description: 'Design customized workflow based on requirements',
              },
            ],
          },
        ],
      };

      // Set workflow template but don't activate yet
      set({
        workflowTemplate,
        isWorkflowActive: false,
      });

      console.log('[PipelineStore] Workflow template initialized successfully');
      console.log('[PipelineStore] Ready for user confirmation to start execution');

      return workflowTemplate;
    } catch (error) {
      console.error('[PipelineStore] Failed to initialize workflow:', error);

      // Reset to safe state on error
      set({ isWorkflowActive: false });

      throw error;
    }
  },

  startWorkflowExecution: async (userData?: {
    user_problem?: string;
    user_submit_files?: string[];
    context_description?: string;
  }) => {
    const { workflowTemplate } = get();

    if (!workflowTemplate) {
      console.error('[PipelineStore] Cannot start workflow: no template available');
      return;
    }

    if (!workflowTemplate.stages || workflowTemplate.stages.length === 0) {
      console.error('[PipelineStore] Cannot start workflow: no stages');
      return;
    }

    const firstStage = workflowTemplate.stages[0];

    if (!firstStage.steps || firstStage.steps.length === 0) {
      console.error('[PipelineStore] Cannot start workflow: no steps in first stage');
      return;
    }

    try {
      // Import dynamically to avoid circular dependencies
      const { useWorkflowStateMachine } = await import('./workflowStateMachine');
      const { getAsyncAdapter } = await import('../utils/workflowInitializer');

      // Reset state machine to clean state (in case it was in FAILED or other state)
      console.log('[PipelineStore] Resetting state machine to IDLE...');
      useWorkflowStateMachine.getState().reset();

      // Mark workflow as active
      set({ isWorkflowActive: true });

      // Get stateJSON - DO NOT set stage_id yet, it should be null in IDLE state
      const stateJSON = useWorkflowStateMachine.getState().stateJSON;

      // Ensure location.current is completely null for IDLE state
      stateJSON.observation.location.current.stage_id = null;
      stateJSON.observation.location.current.step_id = null;
      stateJSON.observation.location.current.behavior_id = null;
      stateJSON.observation.location.current.behavior_iteration = 0;

      // Inject user variables AFTER reset
      if (userData) {
        console.log('[PipelineStore] Injecting user variables:', userData);
        stateJSON.state.variables.user_problem = userData.user_problem || '';
        stateJSON.state.variables.user_submit_files = userData.user_submit_files || [];

        // Also update the goals template with actual values
        const goals = stateJSON.observation.location.goals;
        if (goals) {
          let updatedGoals = goals;
          if (userData.user_problem) {
            updatedGoals = updatedGoals.replace('%user_problem%', userData.user_problem);
          }
          if (userData.user_submit_files && userData.user_submit_files.length > 0) {
            updatedGoals = updatedGoals.replace(
              '%user_submit_files%',
              userData.user_submit_files.join(', ')
            );
          }
          stateJSON.observation.location.goals = updatedGoals;
        }
      }

      useWorkflowStateMachine.getState().setState(stateJSON);

      console.log('[PipelineStore] Workflow state initialized in IDLE (all IDs are null)');
      console.log('[PipelineStore] User variables:', stateJSON.state.variables);
      console.log('[PipelineStore] Current FSM state:', stateJSON.state.FSM.state);

      // Get AsyncStateMachineAdapter
      const asyncAdapter = getAsyncAdapter();
      if (!asyncAdapter) {
        throw new Error('AsyncStateMachineAdapter not initialized');
      }

      // Start execution loop - continuously call step() until terminal state or max iterations
      console.log('[PipelineStore] Starting execution loop...');

      const MAX_ITERATIONS = 50; // Safety limit
      let iteration = 0;
      let currentState = stateJSON;

      const TERMINAL_STATES = ['COMPLETE', 'FAILED', 'CANCELED', 'WORKFLOW_COMPLETED'];

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const fsmState = currentState.state.FSM.state;
        console.log(`[PipelineStore] Iteration ${iteration}: FSM state = ${fsmState}`);

        // Check if we've reached a terminal state
        if (TERMINAL_STATES.includes(fsmState)) {
          console.log(`[PipelineStore] Reached terminal state: ${fsmState}`);
          break;
        }

        try {
          // Execute one step
          const [nextState, transitionName] = await asyncAdapter.step(currentState);

          if (!transitionName) {
            // No transition occurred - this state doesn't require API call
            console.log(`[PipelineStore] No transition from ${fsmState}, stopping loop`);
            break;
          }

          // Update state machine with the result
          useWorkflowStateMachine.getState().setState(nextState);

          console.log(`[PipelineStore] Iteration ${iteration} complete: ${transitionName}`);
          console.log(`[PipelineStore] New FSM state: ${nextState.state.FSM.state}`);

          // Update current state for next iteration
          currentState = nextState;
        } catch (error) {
          console.error(`[PipelineStore] Error in iteration ${iteration}:`, error);
          // Don't break - let it continue to next iteration
          // The error might be transient
        }

        // Small delay to prevent overwhelming the UI
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (iteration >= MAX_ITERATIONS) {
        console.warn(`[PipelineStore] Reached maximum iterations (${MAX_ITERATIONS})`);
      }

      console.log('[PipelineStore] Workflow execution loop completed');
      console.log(`[PipelineStore] Total iterations: ${iteration}`);
      console.log(`[PipelineStore] Final FSM state: ${currentState.state.FSM.state}`);
    } catch (error) {
      console.error('[PipelineStore] Failed to start workflow execution:', error);
      set({ isWorkflowActive: false });
      throw error;
    }
  },

  // ==============================================
  // Reset
  // ==============================================

  reset: () => {
    console.log('[PipelineStore] Resetting store');
    set(initialState);
  },
}));

// ==============================================
// EXPORTS
// ==============================================

export default usePipelineStore;
