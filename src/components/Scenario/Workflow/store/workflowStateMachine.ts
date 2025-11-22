/**
 * Workflow State Machine - Completely Refactored
 * ==================================================
 *
 * This state machine is now ONLY responsible for:
 * 1. Tracking current FSM state
 * 2. Triggering transitions via TransitionCoordinator
 * 3. Storing the full state JSON
 *
 * All business logic (state updates, action execution) is handled by:
 * - TransitionHandlers: Apply state transitions
 * - ScriptStore: Execute actions
 * - API Handlers: Make API calls
 *
 * Ported from: ref/Notebook-BCC/core/state_machine.py
 */

import { create } from 'zustand';
import {
  getTransitionCoordinator,
  initializeTransitionCoordinator,
} from '../transitions/TransitionCoordinator';
import type { NotebookState } from '../types/StateJSON';

// ==============================================
// TYPES & INTERFACES
// ==============================================

/**
 * Workflow state enum (matches VDSAgents backend states - UPPERCASE)
 */
export enum WorkflowState {
  IDLE = 'IDLE',
  STAGE_RUNNING = 'STAGE_RUNNING',
  STEP_RUNNING = 'STEP_RUNNING',
  BEHAVIOR_RUNNING = 'BEHAVIOR_RUNNING',
  BEHAVIOR_COMPLETED = 'BEHAVIOR_COMPLETED',
  STEP_COMPLETED = 'STEP_COMPLETED',
  STAGE_COMPLETED = 'STAGE_COMPLETED',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  PAUSED = 'PAUSED',
}

/**
 * Workflow event enum (triggers transitions)
 */
export enum WorkflowEvent {
  START_WORKFLOW = 'START_WORKFLOW',
  START_STAGE = 'START_STAGE',
  START_STEP = 'START_STEP',
  START_BEHAVIOR = 'START_BEHAVIOR',
  COMPLETE_BEHAVIOR = 'COMPLETE_BEHAVIOR',
  NEXT_BEHAVIOR = 'NEXT_BEHAVIOR',
  COMPLETE_STEP = 'COMPLETE_STEP',
  NEXT_STEP = 'NEXT_STEP',
  COMPLETE_STAGE = 'COMPLETE_STAGE',
  NEXT_STAGE = 'NEXT_STAGE',
  COMPLETE_WORKFLOW = 'COMPLETE_WORKFLOW',
  FAIL = 'FAIL',
  CANCEL = 'CANCEL',
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
}

/**
 * Complete state JSON structure (matches backend format)
 */
export interface StateJSON {
  observation: {
    location: {
      current: {
        stage_id: string | null;
        step_id: string | null;
        behavior_id: string | null;
        behavior_iteration: number;
      };
      progress: {
        stages?: any;
        steps?: any;
        behaviors?: any;
      };
      goals?: string;
    };
  };
  state: {
    FSM: {
      state: string;
      previous_state?: string;
      last_transition?: string;
    };
    notebook?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * State machine store interface
 */
interface WorkflowStateMachineState {
  // Core FSM state
  currentState: WorkflowState;

  // Full state JSON (the single source of truth)
  stateJSON: StateJSON;

  // Transition history for debugging
  transitionHistory: Array<{
    from: string;
    to: string;
    event: WorkflowEvent;
    timestamp: Date;
  }>;
}

interface WorkflowStateMachineActions {
  // Core transition method
  transition: (event: WorkflowEvent, apiResponse?: any) => void;

  // Workflow control
  startWorkflow: (stageId: string) => void;
  fail: (error: Error | string) => void;
  cancel: () => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;

  // State access
  getState: () => StateJSON;
  setState: (newState: StateJSON) => void;
  getCurrentLocation: () => StateJSON['observation']['location']['current'];

  // Notebook state sync
  syncNotebookState: (notebookState: Partial<NotebookState>) => void;

  // API integration
  handleAPIResponse: (apiResponse: any, apiType?: string) => void;
}

export type WorkflowStateMachine = WorkflowStateMachineState & WorkflowStateMachineActions;

// ==============================================
// INITIAL STATE
// ==============================================

/**
 * Create initial StateJSON matching VDSAgents backend format
 *
 * This creates a complete state structure as expected by the backend.
 * Reference: VDSAgents/docs/examples/housing/payloads/00_STATE_IDLE.json
 */
const createInitialStateJSON = (): StateJSON => ({
  observation: {
    location: {
      current: {
        stage_id: null,
        step_id: null,
        behavior_id: null,
        behavior_iteration: 0,
      },
      progress: {
        stages: {
          completed: [],
          current: null,
          remaining: [],
          focus: '',
          current_outputs: {
            expected: [],
            produced: [],
            in_progress: [],
          },
        },
        steps: {
          completed: [],
          current: null,
          remaining: [],
          focus: '',
          current_outputs: {
            expected: [],
            produced: [],
            in_progress: [],
          },
        },
        behaviors: {
          completed: [],
          current: null,
          iteration: null,
          focus: '',
          current_outputs: {
            expected: [],
            produced: [],
            in_progress: [],
          },
        },
      },
      goals:
        '用户提出了问题%user_problem%，上传了文件%user_submit_files%,需要对于用户的问题进行大目标拆分，以目标产物为导向，进行阶段拆分，每个阶段需要有明确的目标，并且需要有明确的目标产物',
    },
  },
  state: {
    variables: {
      user_problem: '',
      user_submit_files: [],
    },
    effects: {
      current: [],
      history: [],
    },
    notebook: {
      notebook_id: null,
      title: null,
      cell_count: 0,
      last_cell_type: null,
      last_output: null,
      cells: [],
      execution_count: 0,
    },
    FSM: {
      state: WorkflowState.IDLE,
      last_transition: null,
      timestamp: new Date().toISOString(),
    },
  },
  metadata: {},
});

// ==============================================
// ZUSTAND STORE
// ==============================================

export const useWorkflowStateMachine = create<WorkflowStateMachine>((set, get) => ({
  // ==============================================
  // State
  // ==============================================
  currentState: WorkflowState.IDLE,
  stateJSON: createInitialStateJSON(),
  transitionHistory: [],

  // ==============================================
  // Core Transition Method
  // ==============================================
  transition: (event: WorkflowEvent, apiResponse?: any) => {
    const currentStateJSON = get().stateJSON;
    const currentFSMState = currentStateJSON.state.FSM.state;

    console.log(`[FSM] Transition requested: ${event} from state ${currentFSMState}`);

    try {
      // Get coordinator
      const coordinator = getTransitionCoordinator();

      // Apply transition
      const { state: updatedStateJSON } = coordinator.applyTransition(
        currentStateJSON,
        apiResponse || {},
        undefined,
        true // auto-trigger enabled
      );

      // Extract new FSM state
      const newFSMState = updatedStateJSON.state.FSM.state;

      // Update store
      set({
        currentState: newFSMState as WorkflowState,
        stateJSON: updatedStateJSON as StateJSON,
        transitionHistory: [
          ...get().transitionHistory,
          {
            from: currentFSMState,
            to: newFSMState,
            event,
            timestamp: new Date(),
          },
        ],
      });

      console.log(`[FSM] Transition complete: ${currentFSMState} → ${newFSMState}`);
    } catch (error) {
      console.error('[FSM] Transition failed:', error);
      get().fail(error as Error);
    }
  },

  // ==============================================
  // Workflow Control
  // ==============================================
  startWorkflow: (stageId: string) => {
    console.log(`[FSM] Starting workflow with stage: ${stageId}`);

    // Update stateJSON with initial stage
    const stateJSON = get().stateJSON;
    stateJSON.observation.location.current.stage_id = stageId;
    stateJSON.observation.location.current.step_id = null;
    stateJSON.observation.location.current.behavior_id = null;

    set({ stateJSON });

    // Trigger START_WORKFLOW event
    get().transition(WorkflowEvent.START_WORKFLOW);
  },

  fail: (error: Error | string) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    console.error(`[FSM] Workflow failed: ${errorMessage}`);

    const stateJSON = get().stateJSON;
    stateJSON.state.FSM.state = WorkflowState.FAILED;
    stateJSON.state.error = errorMessage;

    set({
      currentState: WorkflowState.FAILED,
      stateJSON,
    });
  },

  cancel: () => {
    console.log('[FSM] Workflow canceled');

    const stateJSON = get().stateJSON;
    stateJSON.state.FSM.state = WorkflowState.CANCELED;

    set({
      currentState: WorkflowState.CANCELED,
      stateJSON,
    });
  },

  reset: () => {
    console.log('[FSM] Resetting state machine');

    set({
      currentState: WorkflowState.IDLE,
      stateJSON: createInitialStateJSON(),
      transitionHistory: [],
    });
  },

  pause: () => {
    const currentState = get().currentState;
    console.log('[FSM] Pausing workflow from state:', currentState);

    const stateJSON = get().stateJSON;
    // Store the previous state so we can resume to it
    stateJSON.state.FSM.previous_state = currentState;
    stateJSON.state.FSM.state = WorkflowState.PAUSED;

    set({
      currentState: WorkflowState.PAUSED,
      stateJSON,
    });
  },

  resume: () => {
    const stateJSON = get().stateJSON;
    const previousState = stateJSON.state.FSM.previous_state;

    console.log('[FSM] Resuming workflow to state:', previousState);

    // Only resume if currently paused
    if (get().currentState !== WorkflowState.PAUSED) {
      console.warn('[FSM] Cannot resume - workflow is not paused');
      return;
    }

    // Resume to previous state or default to IDLE
    const resumeState = (previousState as WorkflowState) || WorkflowState.IDLE;
    stateJSON.state.FSM.state = resumeState;
    stateJSON.state.FSM.previous_state = undefined;

    set({
      currentState: resumeState,
      stateJSON,
    });

    // If resuming to a running state, we might need to trigger the next action
    // This depends on your workflow execution logic
    console.log('[FSM] Resumed to state:', resumeState);
  },

  // ==============================================
  // State Access
  // ==============================================
  getState: () => {
    return get().stateJSON;
  },

  setState: (newState: StateJSON) => {
    const newFSMState = newState.state.FSM.state;
    set({
      stateJSON: newState,
      currentState: newFSMState as WorkflowState,
    });
  },

  getCurrentLocation: () => {
    return get().stateJSON.observation.location.current;
  },

  // ==============================================
  // Notebook State Sync
  // ==============================================
  syncNotebookState: (notebookState: Partial<NotebookState>) => {
    const currentStateJSON = get().stateJSON;
    const updatedStateJSON = {
      ...currentStateJSON,
      state: {
        ...currentStateJSON.state,
        notebook: {
          ...currentStateJSON.state.notebook,
          ...notebookState,
        },
      },
    };

    set({ stateJSON: updatedStateJSON });
    console.log('[FSM] Notebook state synced:', notebookState);
  },

  // ==============================================
  // API Integration
  // ==============================================
  handleAPIResponse: (apiResponse: any, apiType?: string) => {
    console.log(`[FSM] Handling API response (type: ${apiType})`);

    try {
      const coordinator = getTransitionCoordinator();
      const currentStateJSON = get().stateJSON;

      const { state: updatedStateJSON } = coordinator.applyTransition(
        currentStateJSON,
        apiResponse,
        apiType,
        true
      );

      const newFSMState = updatedStateJSON.state.FSM.state;

      set({
        currentState: newFSMState as WorkflowState,
        stateJSON: updatedStateJSON as StateJSON,
      });

      console.log(`[FSM] API response handled, new state: ${newFSMState}`);
    } catch (error) {
      console.error('[FSM] Failed to handle API response:', error);
      get().fail(error as Error);
    }
  },
}));

// ==============================================
// INITIALIZATION
// ==============================================

/**
 * Initialize the state machine with stores/context.
 * Call this once at app startup.
 */
export function initializeStateMachine(context: {
  scriptStore?: any;
  apiClient?: any;
  notebookStore?: any;
  aiContextStore?: any;
}) {
  console.log('[FSM] Initializing state machine with context');
  initializeTransitionCoordinator(context);
}

// ==============================================
// EXPORTS
// ==============================================

export { WorkflowEvent as EVENTS, WorkflowState as WORKFLOW_STATES };
export default useWorkflowStateMachine;
