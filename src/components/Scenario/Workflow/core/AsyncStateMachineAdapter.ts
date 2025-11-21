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

import { StateJSON } from '../store/workflowStateMachine';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
import { PlanningAPIHandler, GeneratingAPIHandler, ReflectingAPIHandler } from '../api';
import streamingLogger from '../__tests__/streaming-debug-logger';

export interface APIType {
  value: string;
}

export class AsyncStateMachineAdapter {
  private apiClient: any;
  private lastTransitionName: string | null = null;

  // API Handlers
  private planningHandler: PlanningAPIHandler;
  private generatingHandler: GeneratingAPIHandler;
  private reflectingHandler: ReflectingAPIHandler;

  constructor(apiClient?: any, scriptStore?: any) {
    this.apiClient = apiClient;

    // Initialize API handlers
    this.planningHandler = new PlanningAPIHandler(apiClient);
    this.generatingHandler = new GeneratingAPIHandler(apiClient);
    this.reflectingHandler = new ReflectingAPIHandler(apiClient);

    console.log('[AsyncFSM] Initialized AsyncStateMachineAdapter with API handlers');

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
  setApiClient(apiClient: any): void {
    this.apiClient = apiClient;

    // Reinitialize API handlers
    this.planningHandler = new PlanningAPIHandler(apiClient);
    this.generatingHandler = new GeneratingAPIHandler(apiClient);
    this.reflectingHandler = new ReflectingAPIHandler(apiClient);

    // Inject into TransitionCoordinator
    const coordinator = getTransitionCoordinator();
    coordinator.setContext({ apiClient });
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
   * 6. Return updated state
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

    // Determine which API to call based on state
    const apiType = this.inferAPIType(normalized);

    if (!apiType) {
      console.log(`[AsyncFSM] State ${normalized} does not require API call`);
      return [stateJSON, null];
    }

    try {
      console.log(`[AsyncFSM] Calling ${apiType} API for state: ${normalized}`);

      // Predict transition name for correct log file naming
      const predictedTransitionName = this.predictTransitionName(normalized, apiType);

      // Call the appropriate API
      let apiResponse = await this.callAPI(stateJSON, apiType, predictedTransitionName);

      // Get TransitionCoordinator
      const coordinator = getTransitionCoordinator();

      // For generating/reflecting APIs, execute actions as they arrive (streaming)
      if (apiType === 'generating' || apiType === 'reflecting') {
        // If response is an async iterator, execute actions immediately as they arrive
        if (!apiResponse.actions && typeof apiResponse[Symbol.asyncIterator] === 'function') {
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
            const action = rawAction.action || rawAction;
            const actionType = action.type || 'unknown';

            console.log(`[AsyncFSM] Raw action received:`, JSON.stringify(rawAction, null, 2));
            console.log(`[AsyncFSM] Parsed action type: ${actionType}, executing immediately...`);

            // Log action received
            streamingLogger.actionReceived(actionIndex, actionType);

            // Execute action immediately using scriptStore
            if (scriptStore) {
              try {
                streamingLogger.actionExecutionStart(actionIndex);

                // Convert backend action format to frontend ExecutionStep format
                const executionStep = this.convertActionToExecutionStep(action);

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
              console.warn(
                '[AsyncFSM] No scriptStore available, action will be executed by handler'
              );
              streamingLogger.actionExecutionEnd(actionIndex, 'No scriptStore available');
            }

            // Still collect actions for transition handler (store the unwrapped action)
            actions.push(action);
          }

          streamingLogger.streamingEnded();
          streamingLogger.endSession();
          streamingLogger.printReport();

          console.log(`[AsyncFSM] Streaming execution complete: ${actions.length} actions`);
          apiResponse = { actions, count: actions.length };
        }
      }

      // Parse API response if needed
      const parsedResponse = this.parseAPIResponse(apiResponse);

      // Apply transition (TransitionCoordinator selects appropriate handler)
      // Note: For generating/reflecting, actions are already executed above
      const { state: updatedState, transitionName } = coordinator.applyTransition(
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
   * Infer which API type to call based on current FSM state
   *
   * Logic (based on Planning First protocol):
   * - IDLE → planning (START_WORKFLOW)
   * - STAGE_RUNNING → planning (START_STEP)
   * - STEP_RUNNING → planning (START_BEHAVIOR)
   * - BEHAVIOR_RUNNING → generating (get actions to execute)
   * - *_COMPLETED → reflecting (reflect on completion)
   */
  private inferAPIType(stateStr: string): string | null {
    if (stateStr.includes('BEHAVIOR') && stateStr.includes('RUNNING')) {
      return 'generating';
    }

    if (stateStr.includes('COMPLETED')) {
      return 'reflecting';
    }

    if (stateStr.includes('STEP') && stateStr.includes('RUNNING')) {
      return 'planning';
    }

    if (stateStr.includes('STAGE') && stateStr.includes('RUNNING')) {
      return 'planning';
    }

    if (stateStr === 'IDLE') {
      return 'planning';
    }

    // Terminal states don't need API calls
    if (stateStr === 'COMPLETE' || stateStr === 'FAILED' || stateStr === 'CANCELED') {
      return null;
    }

    console.warn(
      `[AsyncFSM] Cannot infer API type for state: ${stateStr}, defaulting to 'planning'`
    );
    return 'planning';
  }

  /**
   * Predict transition name based on current state and API type
   *
   * This is used for correct log file naming
   */
  private predictTransitionName(stateName: string, apiType: string): string {
    const stateApiToTransition: Record<string, string> = {
      IDLE_planning: 'START_WORKFLOW',
      STAGE_RUNNING_planning: 'START_STEP',
      STEP_RUNNING_planning: 'START_BEHAVIOR',
      BEHAVIOR_RUNNING_generating: 'COMPLETE_BEHAVIOR',
      BEHAVIOR_COMPLETED_reflecting: 'COMPLETE_STEP',
      STEP_COMPLETED_reflecting: 'COMPLETE_STAGE',
      STAGE_COMPLETED_reflecting: 'COMPLETE_WORKFLOW',
    };

    const key = `${stateName}_${apiType}`;
    const predicted = stateApiToTransition[key];

    if (predicted) {
      console.log(`[AsyncFSM] Predicted transition: ${stateName} + ${apiType} API → ${predicted}`);
      return predicted;
    } else {
      console.warn(
        `[AsyncFSM] Cannot predict transition for (${stateName}, ${apiType}), using API type as fallback`
      );
      return apiType;
    }
  }

  /**
   * Call the appropriate API based on type
   * Uses API Handlers for clean separation of concerns
   */
  private async callAPI(
    stateJSON: StateJSON,
    apiType: string,
    transitionName: string
  ): Promise<any> {
    if (!this.apiClient) {
      throw new Error('API client not configured');
    }

    console.log(`[AsyncFSM] Calling ${apiType} API (transition: ${transitionName})`);

    // Extract location data
    const location = stateJSON.observation.location.current;
    const stageId = location.stage_id || 'unknown';
    const stepId = location.step_id || 'none';

    // Call appropriate API handler
    if (apiType === 'planning') {
      return await this.planningHandler.call(stateJSON, stageId, stepId, {
        transition_name: transitionName,
      });
    } else if (apiType === 'generating') {
      return this.generatingHandler.call(stateJSON, stageId, stepId, {
        transition_name: transitionName,
        stream: true,
      });
    } else if (apiType === 'reflecting') {
      return this.reflectingHandler.call(stateJSON, stageId, stepId, {
        transition_name: transitionName,
        stream: true,
      });
    } else {
      throw new Error(`Unknown API type: ${apiType}`);
    }
  }

  /**
   * Parse API response (handle dict, JSON string, and XML string)
   */
  private parseAPIResponse(response: any): any {
    if (typeof response === 'object' && response !== null) {
      return response;
    }

    if (typeof response === 'string') {
      // Try JSON first
      try {
        return JSON.parse(response);
      } catch {
        // TODO: Try XML parsing
        console.warn('[AsyncFSM] XML parsing not implemented, returning raw string');
        return response;
      }
    }

    return response;
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
  private convertActionToExecutionStep(action: any): any {
    const actionType = action.type || 'unknown';

    const executionStep: any = {
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
      phase_id: 'phaseId',
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
