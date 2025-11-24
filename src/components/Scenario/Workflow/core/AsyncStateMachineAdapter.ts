/**
 * Async State Machine Adapter
 * =============================
 *
 * THE MOST IMPORTANT CORE FILE - Provides event-driven async execution
 *
 * Ported from: ref/Notebook-BCC/core/async_state_machine.py
 *
 * Responsibilities:
 * - Wraps WorkflowStateMachine to provide async interface
 * - Coordinates API calls via StateFactory
 * - Delegates transitions to TransitionCoordinator
 * - Contains NO business logic, only coordination
 *
 * New Architecture:
 * - StateFactory & BaseState: Handle API calls (planning/generating/reflecting)
 * - TransitionCoordinator & Handlers: Handle transition execution and state updates
 * - AsyncStateMachineAdapter: Coordinate above components
 */

import { StateJSON, ExecutionStep } from '@Store/models';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';

import streamingLogger from '../__tests__/streaming-debug-logger';
import { StateFactory } from '../states/StateFactory';

export interface APIType {
  value: string;
}

interface APIClient {
  callPlanningAPI: (stateJSON: StateJSON) => AsyncGenerator<unknown>;
  callGeneratingAPI: (stateJSON: StateJSON) => AsyncGenerator<unknown>;
  callReflectingAPI: (stateJSON: StateJSON) => AsyncGenerator<unknown>;
}

interface ScriptStore {
  execAction: (step: ExecutionStep) => Promise<void>;
}

/**
 * Type guard to check if a value is an async iterable
 */
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof (value as any)[Symbol.asyncIterator] === 'function';
}

export class AsyncStateMachineAdapter {
  private lastTransitionName: string | null = null;

  constructor(apiClient?: APIClient, scriptStore?: ScriptStore) {
    console.log('[AsyncFSM] Initialized AsyncStateMachineAdapter');

    // Inject dependencies into TransitionCoordinator
    if (scriptStore || apiClient) {
      const coordinator = getTransitionCoordinator();
      coordinator.setContext({
        scriptStore,
        apiClient,
      });
      console.log('[AsyncFSM] Injected context into TransitionCoordinator');
    }
  }

  /**
   * Set or update the API client
   */
  setApiClient(apiClient: APIClient): void {
    // Inject into TransitionCoordinator
    const coordinator = getTransitionCoordinator();
    coordinator.setContext({ apiClient });

    // Inject into StateFactory
    StateFactory.setApiClient(apiClient);

    console.log('[AsyncFSM] API client injected');
  }

  /**
   * Execute one state transition step
   *
   * THE CORE METHOD - This is where everything happens!
   *
   * Flow:
   * 1. Get current FSM state from stateJSON
   * 2. Determine which API to call (planning/generating/reflecting)
   * 3. Call the appropriate API
   * 4. Pass API response to TransitionCoordinator
   * 5. TransitionCoordinator selects appropriate Handler and applies transition
   * 6. Special handling for BEHAVIOR_COMPLETED:
   *    - If reflecting returns mark-step-complete → transition to STEP_COMPLETED
   *    - If not → implicit next_behavior (clear effects + call /generating)
   *    - Check behavior iteration limit to prevent infinite loops
   * 7. Return updated state
   *
   * @param stateJSON - Current state JSON
   * @returns Tuple of (updated state JSON, transition name)
   */
  async step(stateJSON: StateJSON): Promise<[StateJSON, string | null]> {
    // Reset transition name tracking
    this.lastTransitionName = null;

    // Extract current FSM state from state JSON
    const fsmStateStr = stateJSON.state?.FSM?.state || 'UNKNOWN';

    // Normalize state name
    let normalized = fsmStateStr.toUpperCase();
    if (normalized.endsWith('_COMPLETE') && !normalized.endsWith('_COMPLETED')) {
      normalized = normalized + 'D';
    }

    console.log(`[AsyncFSM] Current state: ${fsmStateStr} (normalized: ${normalized})`);

    // Get State object
    const state = StateFactory.getState(normalized);
    if (!state) {
      console.warn(`[AsyncFSM] Unknown state: ${normalized}`);
      return [stateJSON, null];
    }

    // Determine API type from State object
    const apiTypeEnum = state.getRequiredAPIType();

    if (!apiTypeEnum) {
      console.log(
        `[AsyncFSM] State ${normalized} does not require API call, attempting auto-trigger`
      );

      // Attempt auto-trigger for logic-only states (like STAGE_COMPLETED)
      const coordinator = getTransitionCoordinator();
      const { state: newState, transitionName } =
        await coordinator.autoTriggerNextTransition(stateJSON);

      if (transitionName) {
        console.log(`[AsyncFSM] Auto-triggered transition: ${transitionName}`);
        this.lastTransitionName = transitionName;
        return [newState as StateJSON, transitionName];
      }

      return [stateJSON, null];
    }

    const apiType = apiTypeEnum as string;

    try {
      console.log(`[AsyncFSM] Calling ${apiType} API for state: ${normalized}`);

      // Get expected transition name from State object
      const predictedTransitionName = state.getExpectedTransitionName() || apiType;

      // Call the API via the State object
      // The State object uses its internal handlers which are initialized with apiClient
      let apiResponse = await state.callAPI(stateJSON, predictedTransitionName);

      // Get TransitionCoordinator
      const coordinator = getTransitionCoordinator();

      // For planning/generating/reflecting APIs, execute actions as they arrive (streaming)
      let parsedResponse: Record<string, unknown> = {};

      // If response is an async iterator, execute actions immediately as they arrive
      if (isAsyncIterable(apiResponse)) {
        const actions = [];
        console.log(`[AsyncFSM] Starting streaming action execution...`);

        // Start streaming debug session
        streamingLogger.startSession(`${apiType}-${Date.now()}`);
        streamingLogger.streamingStarted();

        // Get scriptStore from TransitionCoordinator context
        const scriptStore = coordinator.getContext().scriptStore;

        for await (const rawAction of apiResponse) {
          const actionIndex = actions.length;

          // IMPORTANT: Backend returns {"action": {...}} format, need to unwrap
          const action = (rawAction as Record<string, unknown>).action || rawAction;
          const actionType = (action as Record<string, unknown>).type || 'unknown';

          console.log(`[AsyncFSM] Raw action received:`, JSON.stringify(rawAction, null, 2));
          console.log(`[AsyncFSM] Parsed action type: ${actionType}, executing immediately...`);

          // Log action received
          streamingLogger.actionReceived(actionIndex, actionType as string);

          // Execute action immediately using scriptStore
          if (scriptStore) {
            try {
              streamingLogger.actionExecutionStart(actionIndex);

              // Convert backend action format to frontend ExecutionStep format
              const executionStep = this.convertActionToExecutionStep(
                action as Record<string, unknown>
              );

              console.log(`[AsyncFSM] Executing action step:`, executionStep);
              await scriptStore.execAction(executionStep);

              streamingLogger.actionExecutionEnd(actionIndex);
              console.log(`[AsyncFSM] Action ${actionIndex + 1} executed: ${actionType}`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              streamingLogger.actionExecutionEnd(actionIndex, errorMsg);
              console.error(`[AsyncFSM] Failed to execute action ${actionType}:`, error);
            }
          } else {
            console.warn('[AsyncFSM] No scriptStore available, action will be executed by handler');
            streamingLogger.actionExecutionEnd(actionIndex, 'No scriptStore available');
          }

          // Still collect actions for transition handler (store the unwrapped action)
          actions.push(action as Record<string, unknown>);
        }

        streamingLogger.streamingEnded();
        streamingLogger.endSession();
        streamingLogger.printReport();

        console.log(`[AsyncFSM] Streaming execution complete: ${actions.length} actions`);

        // Set parsedResponse to collected actions for TransitionCoordinator
        parsedResponse = { actions };

        // Update stateJSON to latest from store as actions might have changed it
        const { useWorkflowStateMachine } = await import('../store/workflowStateMachine');
        stateJSON = useWorkflowStateMachine.getState().stateJSON;
      } else {
        // Not iterable, parse normally
        parsedResponse = this.parseAPIResponse(apiResponse);
      }

      // Apply transition (TransitionCoordinator selects appropriate handler)
      // Note: For generating/reflecting, actions are already executed above, but we pass them
      // to the coordinator so handlers like NextBehaviorHandler can inspect them.
      const { state: updatedState, transitionName } = await coordinator.applyTransition(
        stateJSON,
        parsedResponse,
        apiType,
        true // auto-trigger enabled
      );

      this.lastTransitionName = transitionName;
      console.log(`[AsyncFSM] Transition applied: ${transitionName}`);

      return [updatedState as StateJSON, transitionName];
    } catch (error) {
      console.error(`[AsyncFSM] API call error for ${normalized}:`, error);
      // TODO: Trigger FAIL event
      return [stateJSON, null];
    }
  }

  /**
   * Parse API response (handle dict, JSON string, and XML string)
   */
  private parseAPIResponse(response: unknown): Record<string, unknown> {
    if (typeof response === 'object' && response !== null) {
      return response as Record<string, unknown>;
    }

    if (typeof response === 'string') {
      // Try JSON first
      try {
        return JSON.parse(response) as Record<string, unknown>;
      } catch {
        // TODO: Try XML parsing
        console.warn('[AsyncFSM] XML parsing not implemented, returning raw string');
        return { rawString: response };
      }
    }

    return {};
  }

  /**
   * Get the last executed transition name
   */
  getLastTransitionName(): string | null {
    return this.lastTransitionName;
  }

  /**
   * Generate a UUID for action store_id
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Convert backend action format to frontend ExecutionStep format
   * Backend uses snake_case, frontend uses camelCase
   */
  private convertActionToExecutionStep(action: Record<string, unknown>): Record<string, unknown> {
    const actionType = action.type || 'unknown';

    const executionStep: Record<string, unknown> = {
      action: actionType,
      content: action.content || '',
      storeId: action.store_id || this.generateUUID(),
      metadata: action.metadata || {},
    };

    // Map snake_case fields to camelCase
    const fieldMapping: Record<string, string> = {
      shot_type: 'shotType',
      codecell_id: 'codecell_id', // Keep as is
      need_output: 'need_output', // Keep as is
      auto_debug: 'auto_debug', // Keep as is
      agent_name: 'agentName',
      custom_text: 'customText',
      text_array: 'textArray',
      thinking_text: 'thinkingText',
      step_id: 'stepId',
      stage_id: 'stageId',
      phase_id: 'phaseId',
      total_steps: 'totalSteps',
      total_stages: 'totalStages',
      task_description: 'taskDescription',
    };

    // Apply field mapping
    Object.entries(action).forEach(([key, value]) => {
      // Skip already mapped fields
      if (['type', 'content', 'store_id', 'metadata'].includes(key)) {
        return;
      }

      // Apply mapping if exists, otherwise use original key
      const targetKey = fieldMapping[key] || key;
      executionStep[targetKey] = value;
    });

    return executionStep;
  }
}

// ==============================================
// Singleton Instance
// ==============================================
let asyncStateMachineInstance: AsyncStateMachineAdapter | null = null;

/**
 * Get or create the AsyncStateMachine singleton instance
 *
 * This ensures we reuse the same instance with the same apiClient and scriptStore
 */
export async function getAsyncStateMachine(): Promise<AsyncStateMachineAdapter> {
  if (!asyncStateMachineInstance) {
    // Dynamic import to avoid circular dependencies
    const { WorkflowAPIClient } = await import('../api/WorkflowAPIClient');
    const { useScriptStore } = await import('../store/useScriptStore');

    const apiClient = new WorkflowAPIClient();
    const scriptStore = useScriptStore.getState();

    asyncStateMachineInstance = new AsyncStateMachineAdapter(apiClient, scriptStore);

    // Initialize StateFactory with apiClient
    StateFactory.setApiClient(apiClient);

    console.log('[AsyncFSM] Created singleton instance');
  }

  return asyncStateMachineInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetAsyncStateMachine(): void {
  asyncStateMachineInstance = null;
  console.log('[AsyncFSM] Reset singleton instance');
}
