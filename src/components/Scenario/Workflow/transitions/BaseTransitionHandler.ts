/**
 * Base Transition Handler
 * Provides common functionality for all FSM transition handlers.
 *
 * Ported from Python: ref/Notebook-BCC/core/transition_handlers/base_transition_handler.py
 */

import type { TransitionHandlerContext } from '@Store/models';

export abstract class BaseTransitionHandler {
  public readonly fromState: string;
  public readonly toState: string;
  public readonly transitionName: string;

  protected scriptStore?: any;
  protected apiClient?: any;
  protected notebookStore?: any;
  protected aiContextStore?: any;

  constructor(fromState: string, toState: string, transitionName: string) {
    this.fromState = fromState;
    this.toState = toState;
    this.transitionName = transitionName;
  }

  /**
   * Check if this handler can handle the given API response.
   */
  abstract canHandle(apiResponse: any): boolean;

  /**
   * Apply the transition to the state.
   */
  abstract apply(state: Record<string, any>, apiResponse: any): Promise<Record<string, any>>;

  /**
   * Set the context (stores) for this handler.
   */
  setContext(context: TransitionHandlerContext): void {
    this.scriptStore = context.scriptStore;
    this.apiClient = context.apiClient;
    this.notebookStore = context.notebookStore;
    this.aiContextStore = context.aiContextStore;
  }

  /**
   * Apply the transition and log it.
   */
  async applyAndLog(
    state: Record<string, any>,
    apiResponse: any,
    _apiType?: string
  ): Promise<Record<string, any>> {
    const fromState = state.state?.FSM?.state || 'UNKNOWN';

    console.log(`[Transition] Applying: ${this.transitionName} (${fromState} → ${this.toState})`);

    // Apply the transition
    const updatedState = await this.apply(state, apiResponse);

    const toState = updatedState.state?.FSM?.state || 'UNKNOWN';

    console.log(`[Transition] Completed: ${this.transitionName} (${fromState} → ${toState})`);

    return updatedState;
  }

  /**
   * Create a deep copy of the state.
   */
  protected deepCopyState(state: Record<string, any>): Record<string, any> {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Get observation structure from state.
   */
  protected getObservation(state: Record<string, any>): Record<string, any> {
    return state.observation || {};
  }

  /**
   * Get location structure from state.
   */
  protected getLocation(state: Record<string, any>): Record<string, any> {
    return this.getObservation(state).location || {};
  }

  /**
   * Get progress structure from state.
   */
  protected getProgress(state: Record<string, any>): Record<string, any> {
    return this.getLocation(state).progress || {};
  }

  /**
   * Get FSM structure from state.
   */
  protected getFSM(state: Record<string, any>): Record<string, any> {
    if (!state.state) {
      state.state = {};
    }
    if (!state.state.FSM) {
      state.state.FSM = {};
    }
    return state.state.FSM;
  }

  /**
   * Update FSM state and transition.
   */
  protected updateFSMState(
    state: Record<string, any>,
    newState: string,
    transitionName: string
  ): void {
    const fsm = this.getFSM(state);
    const oldState = fsm.state || 'UNKNOWN';
    fsm.previous_state = oldState;
    fsm.state = newState;
    fsm.last_transition = transitionName;
    console.log(`[FSM] State transition: ${oldState} → ${newState}`);
  }

  /**
   * Update location.current fields.
   */
  protected updateLocationCurrent(
    state: Record<string, any>,
    updates: {
      stage_id?: string | null;
      step_id?: string | null | 'clear';
      behavior_id?: string | null | 'clear';
      behavior_iteration?: number;
    }
  ): void {
    const location = this.getLocation(state);
    if (!location.current) {
      location.current = {};
    }
    const current = location.current;

    if (updates.stage_id !== undefined) {
      current.stage_id = updates.stage_id;
    }
    if (updates.step_id !== undefined) {
      current.step_id = updates.step_id === 'clear' ? null : updates.step_id;
    }
    if (updates.behavior_id !== undefined) {
      current.behavior_id = updates.behavior_id === 'clear' ? null : updates.behavior_id;
    }
    if (updates.behavior_iteration !== undefined) {
      current.behavior_iteration = updates.behavior_iteration;
    }
  }

  /**
   * Initialize outputs tracking structure.
   */
  protected initOutputsTracking(expectedArtifacts: Record<string, string>): {
    expected: Array<{ name: string; description: string }>;
    produced: Array<any>;
    in_progress: Array<any>;
  } {
    const expected = Object.entries(expectedArtifacts).map(([name, description]) => ({
      name,
      description,
    }));

    return {
      expected,
      produced: [],
      in_progress: [],
    };
  }

  /**
   * Execute an action using script store.
   */
  protected async executeAction(
    actionType: string,
    content = '',
    kwargs: Record<string, any> = {}
  ): Promise<void> {
    if (!this.scriptStore) {
      console.debug(`[Action] Skipping ${actionType}: no script_store available`);
      return;
    }

    try {
      const executionStep = {
        action: actionType,
        content,
        storeId: kwargs.store_id || this.generateUUID(),
        metadata: kwargs.metadata || {},
        ...kwargs,
      };

      await this.scriptStore.execAction(executionStep);
      console.log(`[Action] Executed ${actionType}: ${content.slice(0, 50)}`);
    } catch (error) {
      console.error(`[Action] Failed to execute ${actionType}:`, error);
    }
  }

  /**
   * Generate a UUID.
   */
  protected generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Sync notebook data from stores to state.
   */
  protected syncNotebookToState(state: Record<string, any>): void {
    if (!this.scriptStore?.notebook_store) {
      return;
    }

    try {
      const notebookData = this.scriptStore.notebook_store.to_dict();
      if (!state.state) {
        state.state = {};
      }
      state.state.notebook = notebookData;
      console.debug(`[Sync] Updated notebook in state (cells: ${notebookData.cells?.length || 0})`);
    } catch (error) {
      console.error('[Sync] Failed to sync notebook:', error);
    }
  }
}
