/**
 * Base State Class
 * ================
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/base_state.py
 *
 * Defines the interface for all state classes in the workflow state machine.
 *
 * Each state encapsulates:
 * 1. Valid outgoing transitions
 * 2. Logic to determine next transition based on store/context
 * 3. Initialization from API response
 * 4. Reference to appropriate API type
 */

import { WorkflowEvent } from '@Store/models';
import { PlanningAPIHandler, GeneratingAPIHandler, ReflectingAPIHandler } from '../api';

export enum APIResponseType {
  PLANNING = 'planning',
  GENERATING = 'generating',
  COMPLETE = 'reflecting',
}

export abstract class BaseState {
  protected stateName: string;
  protected apiClient: any;

  // API Handlers
  protected planningHandler: PlanningAPIHandler | null = null;
  protected generatingHandler: GeneratingAPIHandler | null = null;
  protected reflectingHandler: ReflectingAPIHandler | null = null;

  constructor(stateName: string) {
    this.stateName = stateName;
  }

  /**
   * Get all valid outgoing transitions from this state.
   *
   * @returns Dict mapping transition name to WorkflowEvent
   */
  abstract getValidTransitions(): Record<string, WorkflowEvent>;

  /**
   * Determine the next transition based on current state data.
   *
   * This is the key method that encapsulates state-specific logic.
   * It examines the store/context and decides which transition to take.
   *
   * @param stateData - Current state JSON (the full state dict)
   * @param apiResponse - Optional API response data
   * @returns WorkflowEvent to trigger, or null if no transition needed
   */
  abstract determineNextTransition(
    stateData: Record<string, any>,
    apiResponse?: any
  ): WorkflowEvent | null;

  /**
   * Check if transition is allowed based on current state data.
   *
   * This provides conditional logic for multi-branch transitions.
   *
   * @param event - The event to check
   * @param stateData - Current state JSON
   * @returns True if transition is allowed
   */
  abstract canTransitionTo(event: WorkflowEvent, stateData: Record<string, any>): boolean;

  /**
   * Get the API type required for this state.
   *
   * Each state knows which API it should call:
   * - IDLE, STAGE_RUNNING, STEP_RUNNING → Planning API
   * - BEHAVIOR_RUNNING → Generating API
   * - *_COMPLETED → Reflecting API
   * - Terminal states → null
   *
   * @returns APIResponseType to call, or null if no API call needed
   */
  abstract getRequiredAPIType(): APIResponseType | null;

  /**
   * Initialize or update state data from API response.
   *
   * This is called after a transition handler completes.
   * Override this in subclasses if state-specific initialization is needed.
   *
   * @param stateData - Current state JSON
   * @param apiResponse - API response data
   * @returns Updated state JSON
   */
  initializeFromResponse(stateData: Record<string, any>, apiResponse: any): Record<string, any> {
    // Default: no-op, just return state as-is
    return stateData;
  }

  /**
   * Get the appropriate transition handler for moving to target state.
   *
   * @param targetState - Target state name
   * @returns Transition handler instance, or null if not found
   */
  getTransitionHandler(targetState: string): any {
    // Dynamic import to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
    const { getTransitionCoordinator } = require('../transitions/TransitionCoordinator');
    const coordinator = getTransitionCoordinator();
    return coordinator.getHandler(this.stateName, targetState);
  }

  /**
   * Set the API client for this state.
   *
   * @param apiClient - WorkflowAPIClient instance
   */
  setApiClient(apiClient: any): void {
    this.apiClient = apiClient;

    // Initialize API handlers
    this.planningHandler = new PlanningAPIHandler(apiClient);
    this.generatingHandler = new GeneratingAPIHandler(apiClient);
    this.reflectingHandler = new ReflectingAPIHandler(apiClient);

    console.log(`[State.${this.stateName}] API client and handlers injected`);
  }

  /**
   * Call the appropriate API based on state requirements.
   *
   * This is the main entry point for API calls. Each state subclass
   * uses this method to call the appropriate API endpoint with correct parameters.
   *
   * @param stateData - Current state JSON
   * @param transitionName - Optional transition name to pass to API
   * @returns API response (parsed JSON or async iterator for streaming)
   */
  async callAPI(stateData: Record<string, any>, transitionName?: string): Promise<any> {
    // Check what API type this state requires
    const apiType = this.getRequiredAPIType();
    if (!apiType) {
      console.log(`[State.${this.stateName}] No API call required`);
      return null;
    }

    // Validate handlers are configured
    if (apiType === APIResponseType.PLANNING && !this.planningHandler) {
      throw new Error(`Planning API handler not configured for ${this.stateName}`);
    }
    if (apiType === APIResponseType.GENERATING && !this.generatingHandler) {
      throw new Error(`Generating API handler not configured for ${this.stateName}`);
    }
    if (apiType === APIResponseType.COMPLETE && !this.reflectingHandler) {
      throw new Error(`Reflecting API handler not configured for ${this.stateName}`);
    }

    // Extract stage_id and step_id from state
    const observation = stateData.observation || {};
    const location = observation.location || {};
    const current = location.current || {};

    const stageId = current.stage_id || 'unknown';
    const stepId = current.step_id || 'none';

    console.log(
      `[State.${this.stateName}] Calling ${apiType} API (stage=${stageId}, step=${stepId})`
    );

    // Route to appropriate API based on type
    if (apiType === APIResponseType.PLANNING) {
      return await this.callPlanningAPI(stateData, stageId, stepId, transitionName);
    } else if (apiType === APIResponseType.GENERATING) {
      return this.callGeneratingAPI(stateData, stageId, stepId, transitionName);
    } else if (apiType === APIResponseType.COMPLETE) {
      return this.callReflectingAPI(stateData, stageId, stepId, transitionName);
    } else {
      throw new Error(`Unknown API type: ${apiType}`);
    }
  }

  /**
   * Call the Planning API.
   */
  protected async callPlanningAPI(
    stateData: Record<string, any>,
    stageId: string,
    stepId: string,
    transitionName?: string
  ): Promise<any> {
    console.log(
      `[State.${this.stateName}] Calling Planning API via handler (transition=${transitionName})`
    );

    return await this.planningHandler!.call(stateData, stageId, stepId, {
      transition_name: transitionName,
    });
  }

  /**
   * Call the Generating API (returns async iterator).
   */
  protected callGeneratingAPI(
    stateData: Record<string, any>,
    stageId: string,
    stepId: string,
    transitionName?: string
  ): AsyncIterableIterator<any> {
    console.log(
      `[State.${this.stateName}] Calling Generating API via handler (transition=${transitionName})`
    );

    return this.generatingHandler!.call(stateData, stageId, stepId, {
      stream: true,
      transition_name: transitionName,
    });
  }

  /**
   * Call the Reflecting API (returns async iterator).
   */
  protected callReflectingAPI(
    stateData: Record<string, any>,
    stageId: string,
    stepId: string,
    transitionName?: string
  ): AsyncIterableIterator<any> {
    console.log(
      `[State.${this.stateName}] Calling Reflecting API via handler (transition=${transitionName})`
    );

    return this.reflectingHandler!.call(stateData, stageId, stepId, {
      stream: true,
      transition_name: transitionName,
    });
  }

  /**
   * Helper to get progress from state data.
   */
  protected getProgress(stateData: Record<string, any>): Record<string, any> {
    return stateData.observation?.location?.progress || {};
  }

  toString(): string {
    return `State(${this.stateName})`;
  }
}
