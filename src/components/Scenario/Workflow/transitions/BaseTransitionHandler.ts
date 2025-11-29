/**
 * Base Transition Handler
 * Provides common functionality for all FSM transition handlers.
 *
 * Ported from Python: ref/Notebook-BCC/core/transition_handlers/base_transition_handler.py
 */

import type { TransitionHandlerContext } from '@Store/models';
import { WorkflowState } from '../observation/WorkflowState';

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
  abstract apply(state: WorkflowState, apiResponse: any): Promise<WorkflowState>;

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
    state: WorkflowState,
    apiResponse: any,
    _apiType?: string
  ): Promise<WorkflowState> {
    const fromState = state.state.FSM.state || 'UNKNOWN';

    console.log(`[Transition] Applying: ${this.transitionName} (${fromState} → ${this.toState})`);

    // Apply the transition
    const updatedState = await this.apply(state, apiResponse);

    const toState = updatedState.state.FSM.state || 'UNKNOWN';

    console.log(`[Transition] Completed: ${this.transitionName} (${fromState} → ${toState})`);

    return updatedState;
  }

  /**
   * Create a deep copy of the state.
   */
  protected deepCopyState(state: WorkflowState): WorkflowState {
    return new WorkflowState(state.toJSON());
  }

  /**
   * Update FSM state and transition.
   */
  protected updateFSMState(state: WorkflowState, newState: string, transitionName: string): void {
    state.state.FSM.setState(newState);
    state.state.FSM.setLastTransition(transitionName);
    console.log(`[FSM] State transition: ${state.state.FSM.previousState} → ${newState}`);
  }

  /**
   * Update location.current fields.
   */
  protected updateLocationCurrent(
    state: WorkflowState,
    updates: {
      stage_id?: string | null;
      step_id?: string | null | 'clear';
      behavior_id?: string | null | 'clear';
      behavior_iteration?: number;
    }
  ): void {
    const current = state.location.current;

    if (updates.stage_id !== undefined) {
      current.setStageId(updates.stage_id);
    }
    if (updates.step_id !== undefined) {
      if (updates.step_id === 'clear') {
        current.clearStep();
      } else {
        current.setStepId(updates.step_id);
      }
    }
    if (updates.behavior_id !== undefined) {
      if (updates.behavior_id === 'clear') {
        current.clearBehavior();
      } else {
        current.setBehaviorId(updates.behavior_id);
      }
    }
    if (updates.behavior_iteration !== undefined) {
      current.setBehaviorIteration(updates.behavior_iteration);
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
  protected syncNotebookToState(state: WorkflowState): void {
    if (!this.notebookStore) {
      // Try to get it from global import if not injected (fallback)
      // But better to rely on injection.
      console.warn('[Sync] Skipping notebook sync: no notebookStore available');
      return;
    }

    try {
      // useNotebookStore state structure might differ from what NotebookState expects.
      // We need to map it.
      // NotebookState expects: { notebook_id, title, cell_count, cells, ... }
      // useNotebookStore has: { notebookId, title, cells, ... }

      const storeState = this.notebookStore;

      const notebookData = {
        notebook_id: storeState.notebookId,
        title: storeState.title,
        cell_count: storeState.cells.length,
        cells: storeState.cells,
        // Map other fields if necessary
      };

      state.state.notebook.update(notebookData);
      console.debug(`[Sync] Updated notebook in state (cells: ${notebookData.cells?.length || 0})`);
    } catch (error) {
      console.error('[Sync] Failed to sync notebook:', error);
    }
  }
}
