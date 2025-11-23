/**
 * @file usePipelineStore.ts
 * @description Pipeline Store for managing workflow template structure and execution state.
 *
 * Ported from: ref/Notebook-BCC/stores/pipeline_store.py
 *
 * ⚠️⚠️⚠️ DEPRECATED AND REMOVED - DO NOT USE ⚠️⚠️⚠️
 * ===================================================
 * This store has been REMOVED in favor of the unified stateJSON architecture.
 * Most functionality is now NO-OP (does nothing).
 *
 * 🔴 **REMOVED FEATURES**:
 * - initializeWorkflow() - now NO-OP, use useWorkflowStateMachine instead
 * - startWorkflowExecution() - now NO-OP, use useWorkflowStateMachine instead
 * - setWorkflowTemplate() - now NO-OP, data stored in stateJSON
 * - updateStepsForStage() - now NO-OP, data stored in stateJSON
 *
 * **Single Source of Truth**: useWorkflowStateMachine.stateJSON
 *
 * Migration Guide:
 * ---------------
 * OLD (BROKEN):
 *   const pipelineStore = usePipelineStore.getState();
 *   const observation = pipelineStore.observation; // ❌ DOESN'T EXIST!
 *   pipelineStore.initializeWorkflow(request); // ❌ NO-OP!
 *   pipelineStore.startWorkflowExecution(userData); // ❌ NO-OP!
 *
 * NEW (CORRECT):
 *   const stateMachine = useWorkflowStateMachine.getState();
 *   const stateJSON = stateMachine.stateJSON;
 *   const observation = stateJSON.observation; // ✅ Correct
 *
 * Where to find data:
 * - Workflow state: useWorkflowStateMachine.stateJSON
 * - Observation data: useWorkflowStateMachine.stateJSON.observation
 * - FSM state: useWorkflowStateMachine.stateJSON.state.FSM
 * - Progress stages: useWorkflowStateMachine.stateJSON.observation.location.progress.stages
 * - Progress steps: useWorkflowStateMachine.stateJSON.observation.location.progress.steps
 * - Current location: useWorkflowStateMachine.stateJSON.observation.location.current
 *
 * This file is kept ONLY for:
 * - Type definitions (WorkflowTemplate, WorkflowStage, WorkflowStep, etc.)
 * - Preventing compile errors during migration
 * - UI components still referencing it (will be migrated)
 *
 * 🚫 DO NOT USE THIS STORE IN ANY NEW CODE!
 * 🚫 DO NOT ADD ANY NEW FEATURES TO THIS STORE!
 */

/**
 * @deprecated Use useWorkflowStateMachine.stateJSON instead
 *
 * Responsibilities (legacy):
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
import type { WorkflowStep, WorkflowTemplate, PlanningRequest } from '@Store/models';

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

  setWorkflowTemplate: (_template: WorkflowTemplate) => {
    console.warn(
      '[PipelineStore] ⚠️ DEPRECATED NO-OP: setWorkflowTemplate() does nothing. Use useWorkflowStateMachine.stateJSON instead.'
    );
    // NO-OP: Data should be in stateJSON.observation.location.progress.stages
  },

  getWorkflowTemplate: () => {
    return get().workflowTemplate;
  },

  updateStepsForStage: (_stageId: string, _newSteps: WorkflowStep[]) => {
    console.warn(
      '[PipelineStore] ⚠️ DEPRECATED NO-OP: updateStepsForStage() does nothing. Use useWorkflowStateMachine.stateJSON instead.'
    );
    // NO-OP: Data should be in stateJSON.observation.location.progress.steps
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

  initializeWorkflow: async (_planningRequest: PlanningRequest) => {
    console.warn(
      '[PipelineStore] ⚠️ DEPRECATED NO-OP: initializeWorkflow() does nothing. Use useWorkflowStateMachine instead.'
    );
    // NO-OP: Return empty template to prevent errors
    return {
      id: 'deprecated',
      name: 'DEPRECATED',
      description: 'This store is deprecated, use useWorkflowStateMachine.stateJSON',
      stages: [],
      metadata: {},
    };
  },

  startWorkflowExecution: async (_userData?: {
    user_problem?: string;
    user_submit_files?: string[];
    context_description?: string;
  }) => {
    console.warn(
      '[PipelineStore] ⚠️ DEPRECATED NO-OP: startWorkflowExecution() does nothing. Use useWorkflowStateMachine.startWorkflow() instead.'
    );
    // NO-OP: Workflow execution should be started via useWorkflowStateMachine
    // The execution loop logic has been moved to useWorkflowStateMachine or a dedicated workflow controller
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
