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
import { StateFactory } from '../states/StateFactory';
import type { NotebookState, StateJSON } from '@Store/models';
import { createInitialStateJSON } from '@Store/models';
import { WorkflowEvent, WorkflowState } from '@Store/models';

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

    try {
      // Get coordinator
      const coordinator = getTransitionCoordinator();

      // Apply transition
      const { state: updatedStateJSON } = await coordinator.applyTransition(
        currentStateJSON,
        apiResponse || {},
        undefined,
        true // auto-trigger enabled
      );

      // Extract new FSM state
      const newFSMState = (updatedStateJSON as StateJSON).state.FSM.state;

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
    const stateJSON = get().stateJSON;
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

    set({ stateJSON });

    // Set isExecuting flag in notebookStore to prevent auto-navigation during workflow
    const { default: useNotebookStore } = await import('@Store/notebookStore');
    useNotebookStore.getState().isExecuting = true;
    console.log('[FSM] Set notebookStore.isExecuting = true');

    // Navigate to workspace if notebookId exists and not already in workspace
    const notebookId = useNotebookStore.getState().notebookId;
    if (notebookId) {
      const { default: useRouteStore } = await import('@Store/routeStore');
      const currentView = useRouteStore.getState().currentView;

      if (currentView !== 'workspace') {
        console.log('[FSM] Navigating to workspace:', notebookId);
        useRouteStore.getState().navigateToWorkspace(notebookId);
      } else {
        console.log('[FSM] Already in workspace view, skipping navigation');
      }
    } else {
      console.warn('[FSM] No notebookId available for navigation');
    }

    // ✅ FIX: Execute IDLE state to call planning API
    // IDLE state will call /planning API, which returns stages
    // Then the API response will trigger START_WORKFLOW transition
    console.log('[FSM] Executing IDLE state to call planning API...');
    const { getAsyncStateMachine } = await import('../core/AsyncStateMachineAdapter');
    const asyncFSM = await getAsyncStateMachine();

    try {
      // Execute IDLE → STAGE_RUNNING (planning API)
      let [currentStateJSON, transitionName] = await asyncFSM.step(get().stateJSON);
      console.log(`[FSM] Planning API completed with transition: ${transitionName}`);

      // Update state with the result from planning API
      set({
        stateJSON: currentStateJSON,
        currentState: currentStateJSON.state.FSM.state as WorkflowState,
      });

      // Continue workflow execution through the state chain
      // The AsyncStateMachineAdapter uses State objects to determine next steps.
      // Loop continues until we reach a terminal state or no transition occurs.
      let maxIterations = 20; // Safety limit to prevent infinite loops
      let iterations = 0;

      while (iterations < maxIterations) {
        iterations++;
        const currentState = currentStateJSON.state.FSM.state;

        console.log(`[FSM] Auto-execution iteration ${iterations}, current state: ${currentState}`);

        // Stop if we reach terminal states (but allow BEHAVIOR_RUNNING to execute first)
        if (
          currentState === 'FAILED' ||
          currentState === 'COMPLETE' ||
          currentState === 'CANCELED'
        ) {
          console.log(`[FSM] Workflow auto-execution stopped at terminal state: ${currentState}`);
          break;
        }

        // Execute next step - AsyncStateMachineAdapter will:
        // 1. Infer which API to call based on current state
        // 2. Call the API and get response
        // 3. Pass response to TransitionCoordinator which selects correct handler
        // 4. Return updated state after transition
        console.log(`[FSM] Executing step for state: ${currentState}`);

        [currentStateJSON, transitionName] = await asyncFSM.step(currentStateJSON);
        console.log(`[FSM] Transition completed: ${transitionName || 'none'}`);

        // Update state
        set({
          stateJSON: currentStateJSON,
          currentState: currentStateJSON.state.FSM.state as WorkflowState,
        });

        // After executing, check if we've completed behavior execution
        const newState = currentStateJSON.state.FSM.state;
        if (newState === 'BEHAVIOR_COMPLETED') {
          console.log('[FSM] Reached BEHAVIOR_COMPLETED');
        }

        // If no transition occurred, stop to prevent infinite loop
        if (!transitionName) {
          console.warn('[FSM] No transition occurred, stopping auto-execution');
          break;
        }
      }

      if (iterations >= maxIterations) {
        console.warn(
          '[FSM] Maximum iterations reached, stopping auto-execution to prevent infinite loop'
        );
      }
    } catch (error) {
      console.error('[FSM] Failed to execute workflow:', error);
      get().fail(error as Error);
    } finally {
      // Reset isExecuting flag when workflow execution pauses or completes
      useNotebookStore.getState().isExecuting = false;
      console.log('[FSM] Set notebookStore.isExecuting = false');
    }
  },

  fail: (error: Error | string) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    console.error(`[FSM] Workflow failed: ${errorMessage}`);

    const stateJSON = get().stateJSON;
    stateJSON.state.FSM.state = WorkflowState.FAILED;
    if (!stateJSON.metadata) stateJSON.metadata = {};
    stateJSON.metadata.error = errorMessage;

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
  handleAPIResponse: async (apiResponse: Record<string, unknown>, apiType?: string) => {
    console.log(`[FSM] Handling API response (type: ${apiType})`);

    try {
      const coordinator = getTransitionCoordinator();
      const currentStateJSON = get().stateJSON;

      const { state: updatedStateJSON } = await coordinator.applyTransition(
        currentStateJSON,
        apiResponse,
        apiType,
        true
      );

      const newFSMState = (updatedStateJSON as StateJSON).state.FSM.state;

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
