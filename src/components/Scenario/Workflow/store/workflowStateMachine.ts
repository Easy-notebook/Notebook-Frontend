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
import { Immer } from 'immer';
import {
  getTransitionCoordinator,
  initializeTransitionCoordinator,
} from '../transitions/TransitionCoordinator';
import { StateFactory } from '../states/StateFactory';
import type { NotebookState, StateJSON } from '@Store/models';
import { createInitialStateJSON } from '@Store/models';
import { WorkflowEvent, WorkflowState } from '@Store/models';
import { WORKFLOW_MAX_ITERATIONS } from '../../../../config/workflow';
import { WorkflowState as WorkflowStateModel } from '../observation/WorkflowState';
import { WorkflowRunSession } from '../core/WorkflowRunSession';
import { WorkflowTransitionSession } from '../core/WorkflowTransitionSession';
import useNotebookStore, { notebookExecutionActivity } from '@Store/notebookStore';

// Local copy-on-write updates keep published snapshots plain rather than freezing shared data.
const snapshotUpdates = new Immer({ autoFreeze: false });

// ==============================================
// TYPES & INTERFACES
// ==============================================

/**
 * Workflow state enum (matches VDSAgents backend states - UPPERCASE)
 */
// Enums and StateJSON are now provided by @Store/models and ../types/StateJSON

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
  transition: (event: WorkflowEvent, apiResponse?: Record<string, unknown>) => Promise<void>;

  // Workflow control
  startWorkflow: (payload: string | { stageId?: string; [key: string]: unknown }) => Promise<void>;
  fail: (error: Error | string) => void;
  cancel: () => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;

  // State access
  getState: () => StateJSON;
  setState: (newState: StateJSON) => void;
  updateState: (update: (draft: StateJSON) => void) => void;
  getCurrentLocation: () => StateJSON['observation']['location']['current'];

  // Notebook state sync
  syncNotebookState: (notebookState: Partial<NotebookState>) => void;

  // API integration
  handleAPIResponse: (apiResponse: Record<string, unknown>, apiType?: string) => Promise<void>;
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
// Initial state JSON is provided by createInitialStateJSON from types/StateJSON

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
  transition: async (event: WorkflowEvent, apiResponse?: Record<string, unknown>) => {
    const currentStateJSON = get().stateJSON;
    const currentFSMState = currentStateJSON.state.FSM.state;

    console.log(`[FSM] Transition requested: ${event} from state ${currentFSMState}`);

    await directTransitions.run(apiResponse || {}, undefined, (updatedStateJSON, previous) => {
      const newFSMState = updatedStateJSON.state.FSM.state;
      set({
        currentState: newFSMState as WorkflowState,
        stateJSON: updatedStateJSON,
        transitionHistory: [
          ...get().transitionHistory,
          { from: previous.state.FSM.state, to: newFSMState, event, timestamp: new Date() },
        ],
      });
      console.log(`[FSM] Transition complete: ${currentFSMState} → ${newFSMState}`);
    });
  },

  // ==============================================
  // Workflow Control
  // ==============================================
  /**
   * Start workflow execution
   *
   * Start workflow execution
   *
   * Executes the workflow by continuously calling the async state machine.
   * The state machine determines the flow based on state logic.
   */
  startWorkflow: async (payload: string | { stageId?: string; [key: string]: unknown }) => {
    let stageId = 'planning';
    let variables: Record<string, unknown> = {};

    if (typeof payload === 'string') {
      stageId = payload;
    } else if (typeof payload === 'object' && payload !== null) {
      const { stageId: sid, ...vars } = payload;
      if (sid) stageId = sid;
      variables = vars;
    }

    console.log(`[FSM] Starting workflow with stage: ${stageId}`, variables);

    // Update stateJSON with initial stage and variables
    const stateJSON = structuredClone(get().stateJSON);
    stateJSON.state.FSM = {
      ...stateJSON.state.FSM,
      state: WorkflowState.IDLE,
      last_transition: null,
    };
    stateJSON.observation.location.current.stage_id = stageId;
    stateJSON.observation.location.current.step_id = null;
    stateJSON.observation.location.current.behavior_id = null;

    // Merge variables
    if (Object.keys(variables).length > 0) {
      stateJSON.state.variables = {
        ...stateJSON.state.variables,
        ...variables,
      };
    }

    await automaticRun.start(stateJSON);
  },

  fail: (error: Error | string) => {
    automaticRun.stop();
    const errorMessage = typeof error === 'string' ? error : error.message;
    console.error(`[FSM] Workflow failed: ${errorMessage}`);

    const stateJSON = structuredClone(get().stateJSON);
    stateJSON.state.FSM.state = WorkflowState.FAILED;
    if (!stateJSON.metadata) stateJSON.metadata = {};
    stateJSON.metadata.error = errorMessage;

    set({
      currentState: WorkflowState.FAILED,
      stateJSON,
    });
  },

  cancel: () => {
    automaticRun.stop();
    console.log('[FSM] Workflow canceled');

    const stateJSON = structuredClone(get().stateJSON);
    stateJSON.state.FSM.state = WorkflowState.CANCELED;

    set({
      currentState: WorkflowState.CANCELED,
      stateJSON,
    });
  },

  reset: () => {
    automaticRun.stop();
    console.log('[FSM] Resetting state machine');

    set({
      currentState: WorkflowState.IDLE,
      stateJSON: createInitialStateJSON(),
      transitionHistory: [],
    });
  },

  pause: () => {
    const currentState = get().currentState;
    if (currentState === WorkflowState.PAUSED) return;
    automaticRun.stop();
    console.log('[FSM] Pausing workflow from state:', currentState);

    const stateJSON = structuredClone(get().stateJSON);
    // Store the previous state so we can resume to it
    stateJSON.state.FSM.previous_state = currentState;
    stateJSON.state.FSM.state = WorkflowState.PAUSED;

    set({
      currentState: WorkflowState.PAUSED,
      stateJSON,
    });
  },

  resume: () => {
    const stateJSON = structuredClone(get().stateJSON);
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
    void automaticRun.start(stateJSON);
  },

  // ==============================================
  // State Access
  // ==============================================
  getState: () => {
    return get().stateJSON;
  },

  updateState: (update) => {
    set((current) => {
      const stateJSON = snapshotUpdates.produce(current.stateJSON, update);
      return stateJSON === current.stateJSON
        ? current
        : { stateJSON, currentState: stateJSON.state.FSM.state };
    });
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
  handleAPIResponse: async (apiResponse: Record<string, unknown>, apiType?: string) => {
    console.log(`[FSM] Handling API response (type: ${apiType})`);

    await directTransitions.run(apiResponse, apiType, (updatedStateJSON) => {
      const newFSMState = updatedStateJSON.state.FSM.state;
      set({ currentState: newFSMState as WorkflowState, stateJSON: updatedStateJSON });
      console.log(`[FSM] API response handled, new state: ${newFSMState}`);
    });
  },
}));

const directTransitions = new WorkflowTransitionSession({
  snapshot: () => useWorkflowStateMachine.getState().stateJSON,
  notebookId: () => useNotebookStore.getState().notebookId,
  watch: (check) => {
    const stopWorkflow = useWorkflowStateMachine.subscribe(check);
    const stopNotebook = useNotebookStore.subscribe(check);
    return () => {
      stopWorkflow();
      stopNotebook();
    };
  },
  apply: async (snapshot, response, apiType, signal) => {
    const { state } = await getTransitionCoordinator().applyTransition(
      new WorkflowStateModel(snapshot),
      response,
      apiType,
      true,
      signal
    );
    return state.toJSON();
  },
  fail: (error) =>
    useWorkflowStateMachine.getState().fail(error instanceof Error ? error : String(error)),
});

let releaseWorkflowActivity: (() => void) | undefined;
let workflowActivityVersion = 0;
const automaticRun = new WorkflowRunSession({
  notebookId: () => useNotebookStore.getState().notebookId,
  watch: (check) => useNotebookStore.subscribe(check),
  prepare: async (signal) => {
    const notebookId = useNotebookStore.getState().notebookId;
    if (notebookId) {
      const { default: routes } = await import('@Store/routeStore');
      signal.throwIfAborted();
      if (routes.getState().currentView !== 'workspace')
        routes.getState().navigateToWorkspace(notebookId);
    }
    signal.throwIfAborted();
    const { getAsyncStateMachine } = await import('../core/AsyncStateMachineAdapter');
    signal.throwIfAborted();
    const adapter = await getAsyncStateMachine();
    signal.throwIfAborted();
    return (snapshot, cancellation) => adapter.step(snapshot, cancellation);
  },
  publish: (snapshot) =>
    useWorkflowStateMachine.setState({
      stateJSON: snapshot,
      currentState: snapshot.state.FSM.state,
    }),
  busy: (value) => {
    const version = ++workflowActivityVersion;
    if (value) {
      if (releaseWorkflowActivity) return;
      const activity = notebookExecutionActivity.acquire();
      if (version === workflowActivityVersion) releaseWorkflowActivity = activity.release;
      else activity.release();
    } else {
      const release = releaseWorkflowActivity;
      releaseWorkflowActivity = undefined;
      release?.();
    }
  },
  fail: (error) =>
    useWorkflowStateMachine.getState().fail(error instanceof Error ? error : String(error)),
  limit: WORKFLOW_MAX_ITERATIONS,
});

// ==============================================
// INITIALIZATION
// ==============================================

/**
 * Initialize the state machine with stores/context.
 * Call this once at app startup.
 */
export function initializeStateMachine(context: {
  scriptStore?: Record<string, unknown>;
  apiClient?: Record<string, unknown>;
  notebookStore?: Record<string, unknown>;
  aiContextStore?: Record<string, unknown>;
}) {
  console.log('[FSM] Initializing state machine with context');
  initializeTransitionCoordinator(context);

  if (context.apiClient) {
    StateFactory.setApiClient(context.apiClient);
  }
}

// ==============================================
// EXPORTS
// ==============================================

export { WorkflowEvent, WorkflowState };
export { WorkflowEvent as EVENTS, WorkflowState as WORKFLOW_STATES };
export default useWorkflowStateMachine;
