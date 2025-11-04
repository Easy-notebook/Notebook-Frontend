/**
 * @file usePipelineStore.ts
 * @description Zustand store for managing the workflow's structural data, such as its stages and steps.
 * This store acts as the central repository for the "blueprint" of the workflow,
 * which the WorkflowStateMachine consumes to guide its execution flow.
 *
 * @author Hu Silan
 * @project Easy-notebook
 */

import { create } from 'zustand';
import { WorkflowTemplate, WorkflowStep } from './workflowStateMachine'; // Assuming types are in the same directory

// ==============================================
// 1. TYPES & INTERFACES
// ==============================================

/**
 * @interface PipelineStoreState
 * @description Defines the state managed by the pipeline store.
 * @property {WorkflowTemplate | null} workflowTemplate - The entire structure of the current workflow. Null if no workflow is loaded.
 */
export const PIPELINE_STAGES = {
  EMPTY: 'EMPTY',
  PROBLEM_DEFINE: 'PROBLEM_DEFINE',
} as const;
type PreStage = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

interface PipelineStoreState {
  workflowTemplate: WorkflowTemplate | null;
  // UI-related pipeline states
  currentPreStage: PreStage;
  isAnimating: boolean;
  animationDirection: 'forward' | 'backward';
  isWorkflowActive: boolean;
}

/**
 * @interface PipelineStoreActions
 * @description Defines the actions that can be performed on the pipeline store's state.
 */
interface PipelineStoreActions {
  /** Set pre-stage UI */
  setPreStage: (stage: PreStage) => void;

  /** Toggle animation flags */
  setAnimation: (isAnimating: boolean, direction?: 'forward' | 'backward') => void;

  /**
   * Loads or replaces the entire workflow template.
   */
  setWorkflowTemplate: (template: WorkflowTemplate) => void;

  /** Mark workflow active flag */
  setWorkflowActive: (active: boolean) => void;

  /** Initialize workflow asynchronously */
  initializeWorkflow: (planningRequest: any) => Promise<void>;

  /** Start workflow execution after user confirmation */
  startWorkflowExecution: () => void;

  /** Update steps */
  updateStepsForStage: (stageId: string, newSteps: WorkflowStep[]) => void;

  /** Reset store */
  reset: () => void;
}

/**
 * @type PipelineStore
 * @description The complete type for the Zustand store, combining state and actions.
 */
export type PipelineStore = PipelineStoreState & PipelineStoreActions;

// ==============================================
// 2. INITIAL STATE
// ==============================================

/**
 * @const initialState
 * @description The default state for the pipeline store when it is created or reset.
 */
const initialState: PipelineStoreState = {
  workflowTemplate: null,
  currentPreStage: 'EMPTY',
  isAnimating: false,
  animationDirection: 'forward',
  isWorkflowActive: false,
};

// ==============================================
// 3. ZUSTAND STORE DEFINITION
// ==============================================

/**
 * `usePipelineStore`
 *
 * This Zustand store holds the static structure of the workflow. The `workflowStateMachine`
 * reads from this store to understand the sequence of stages and steps it needs to execute.
 */
export const usePipelineStore = create<PipelineStore>((set) => ({
  // Initial state
  ...initialState,

  // --- UI helpers ---
  setPreStage: (stage) => set({ currentPreStage: stage }),
  setAnimation: (animating, direction = 'forward') => set({ isAnimating: animating, animationDirection: direction }),
  setWorkflowActive: (active) => set({ isWorkflowActive: active }),

  // --- Core actions ---
  setWorkflowTemplate: (template) => {
    console.log('[PipelineStore] Setting new workflow template:', template.name);
    set({ workflowTemplate: template });
  },

  /**
   * Initialize workflow using the predefined template
   */
  initializeWorkflow: async (planningRequest) => {
    console.log('[PipelineStore] initializeWorkflow invoked with:', planningRequest);
    
    try {
      // Use the predefined workflow template that matches the backend structure
      const workflowTemplate = {
        id: "dcls_workflow",
        name: "Data Science Lifecycle (DCLS) Analysis",
        description: "Complete data science workflow based on existence first principles",
        stages: [
          {
            id: "chapter_0_planning",
            title: "Planning & Analysis",
            description: "Initial problem analysis and workflow planning",
            steps: [
              {
                id: "chapter_0_planning_section_1_design_workflow",
                step_id: "chapter_0_planning_section_1_design_workflow",
                title: "Design Workflow",
                description: "Design customized workflow based on requirements"
              }
            ]
          },
        ]
      };

      // Set workflow template in store (but don't start execution yet)
      set({ 
        workflowTemplate, 
        isWorkflowActive: false, // Keep false until user confirms
        currentPreStage: 'EMPTY' 
      });

      console.log('[PipelineStore] Predefined workflow template set successfully. Ready for user confirmation.');

    } catch (error) {
      console.error('[PipelineStore] Failed to initialize workflow:', error);
      // Reset to safe state on error
      set({ isWorkflowActive: false, currentPreStage: 'PROBLEM_DEFINE' });
      throw error;
    }
  },

  startWorkflowExecution: () => {
    const state = usePipelineStore.getState();
    if (!state.workflowTemplate) {
      console.error('[PipelineStore] Cannot start workflow: no template available');
      return;
    }

    try {
      // Import dynamically to avoid circular dependencies
      import('./workflowStateMachine').then(({ useWorkflowStateMachine }) => {
        const firstStageId = state.workflowTemplate!.stages[0]?.id;
        const firstStepId = state.workflowTemplate!.stages[0]?.steps[0]?.id;
        
        if (firstStageId && firstStepId) {
          // Mark workflow as active
          usePipelineStore.setState({ isWorkflowActive: true });
          
          // Start the state machine
          useWorkflowStateMachine.getState().startWorkflow({
            stageId: firstStageId,
            stepId: firstStepId
          });
          
          console.log('[PipelineStore] Workflow execution started successfully');
        } else {
          throw new Error('Invalid workflow template: missing stage or step IDs');
        }
      });
    } catch (error) {
      console.error('[PipelineStore] Failed to start workflow execution:', error);
    }
  },

  updateStepsForStage: (stageId, newSteps) => {
    set((state) => {
      if (!state.workflowTemplate) {
        console.warn(`[PipelineStore] Cannot update steps for stage '${stageId}': workflowTemplate is null.`);
        return state;
      }
      const updatedStages = state.workflowTemplate.stages.map((stage) =>
        stage.id === stageId ? { ...stage, steps: newSteps } : stage
      );
      return {
        workflowTemplate: { ...state.workflowTemplate, stages: updatedStages },
      };
    });
  },

  reset: () => {
    console.log('[PipelineStore] Resetting state.');
    set(initialState);
  },
}));