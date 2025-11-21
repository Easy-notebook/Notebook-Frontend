/**
 * Transition Coordinator
 * Coordinates FSM state transitions using appropriate handlers.
 *
 * This is the main entry point for applying state transitions.
 * Ported from: ref/Notebook-BCC/core/transition_handlers/transition_coordinator.py
 */

import { BaseTransitionHandler, TransitionHandlerContext } from './BaseTransitionHandler';
import { StartWorkflowHandler } from './StartWorkflowHandler';
import { StartStepHandler } from './StartStepHandler';
import { StartBehaviorHandler } from './StartBehaviorHandler';
import { CompleteBehaviorHandler } from './CompleteBehaviorHandler';
import { NextBehaviorHandler } from './NextBehaviorHandler';
import { CompleteStepHandler } from './CompleteStepHandler';
import { NextStepHandler } from './NextStepHandler';
import { CompleteStageHandler } from './CompleteStageHandler';
import { NextStageHandler } from './NextStageHandler';

export class TransitionCoordinator {
  private handlers: BaseTransitionHandler[] = [];
  private context: TransitionHandlerContext = {};

  constructor(context?: TransitionHandlerContext) {
    if (context) {
      this.context = context;
    }
    this.registerHandlers();
  }

  /**
   * Register all transition handlers.
   */
  private registerHandlers(): void {
    this.handlers = [
      new StartWorkflowHandler(),
      new StartStepHandler(),
      new StartBehaviorHandler(),
      new CompleteBehaviorHandler(),
      new NextBehaviorHandler(),
      new CompleteStepHandler(),
      new NextStepHandler(),
      new CompleteStageHandler(),
      new NextStageHandler(),
    ];

    // Inject context into all handlers
    if (this.context.scriptStore || this.context.apiClient) {
      for (const handler of this.handlers) {
        handler.setContext(this.context);
      }
      console.log(`[Coordinator] Injected context into ${this.handlers.length} handlers`);
    }

    console.log(`[Coordinator] Registered ${this.handlers.length} transition handlers`);
  }

  /**
   * Apply state transition based on API response.
   */
  applyTransition(
    state: Record<string, any>,
    apiResponse: any,
    apiType?: string,
    autoTrigger = true
  ): { state: Record<string, any>; transitionName: string } {
    console.log(
      `[Coordinator] Applying transition (apiType=${apiType}, autoTrigger=${autoTrigger})`
    );

    // Find handler that can process this response
    const handler = this.findHandler(apiResponse);

    if (!handler) {
      console.warn('[Coordinator] No handler found for response:', typeof apiResponse);
      if (typeof apiResponse === 'object' && apiResponse !== null) {
        console.warn('[Coordinator] Response keys:', Object.keys(apiResponse));
      }
      throw new Error(
        `No transition handler found for API response. ` +
          `Response type: ${typeof apiResponse}, ` +
          `Keys: ${
            typeof apiResponse === 'object' && apiResponse !== null
              ? Object.keys(apiResponse).join(', ')
              : 'N/A'
          }`
      );
    }

    // Get transition name from handler
    const transitionName = handler.transitionName;
    console.log(
      `[Coordinator] Selected handler: ${handler.constructor.name} (transition=${transitionName})`
    );

    // Apply transition and log it
    const updatedState = handler.applyAndLog(state, apiResponse, apiType);

    console.log(`[Coordinator] Transition applied successfully: ${transitionName}`);

    // Auto-trigger next transition if enabled
    let finalState = updatedState;
    if (autoTrigger) {
      finalState = this.autoTriggerNextTransition(updatedState);
    }

    return { state: finalState, transitionName };
  }

  /**
   * Find the appropriate handler for the API response.
   */
  private findHandler(apiResponse: any): BaseTransitionHandler | null {
    for (const handler of this.handlers) {
      if (handler.canHandle(apiResponse)) {
        return handler;
      }
    }
    return null;
  }

  /**
   * Set the context for all handlers.
   */
  setContext(context: TransitionHandlerContext): void {
    this.context = { ...this.context, ...context };
    for (const handler of this.handlers) {
      handler.setContext(this.context);
    }
    console.log('[Coordinator] Updated context for all handlers');
  }

  /**
   * Get the current context (for accessing scriptStore, apiClient, etc.)
   */
  getContext(): TransitionHandlerContext {
    return this.context;
  }

  /**
   * Get list of all registered handlers.
   */
  getRegisteredHandlers(): BaseTransitionHandler[] {
    return [...this.handlers];
  }

  /**
   * Get a specific transition handler by state transition.
   */
  getHandler(fromState: string, toState: string): BaseTransitionHandler | null {
    // Normalize state names
    const from = fromState.toUpperCase();
    const to = toState.toUpperCase();

    // Search for matching handler
    for (const handler of this.handlers) {
      const handlerFrom = handler.fromState.toUpperCase();
      const handlerTo = handler.toState.toUpperCase();

      if (handlerFrom === from && handlerTo === to) {
        return handler;
      }
    }

    console.warn(`[Coordinator] No handler found for ${fromState} -> ${toState}`);
    return null;
  }

  /**
   * Automatically trigger the next transition if determined by current state.
   *
   * Only certain states support auto-triggering:
   * - STEP_COMPLETED: Can auto-trigger NEXT_STEP or COMPLETE_STAGE
   * - STAGE_COMPLETED: Can auto-trigger NEXT_STAGE or COMPLETE_WORKFLOW
   *
   * States that require API response (e.g., BEHAVIOR_COMPLETED) are excluded.
   */
  private autoTriggerNextTransition(state: Record<string, any>): Record<string, any> {
    const currentStateName = state.state?.FSM?.state;

    if (!currentStateName) {
      return state;
    }

    // Only auto-trigger for specific states
    const AUTO_TRIGGER_ALLOWED_STATES = ['STEP_COMPLETED', 'STAGE_COMPLETED', 'ACTION_COMPLETED'];

    if (!AUTO_TRIGGER_ALLOWED_STATES.includes(currentStateName)) {
      console.log(
        `[Auto-Trigger] Skipping auto-trigger for ${currentStateName} (requires API response)`
      );
      return state;
    }

    // TODO: Implement state-specific auto-trigger logic
    // For now, just return the state as-is
    console.log(`[Auto-Trigger] Auto-trigger not yet implemented for ${currentStateName}`);
    return state;
  }
}

// Global singleton instance
let coordinatorInstance: TransitionCoordinator | null = null;

/**
 * Get the global transition coordinator instance.
 */
export function getTransitionCoordinator(): TransitionCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new TransitionCoordinator();
  }
  return coordinatorInstance;
}

/**
 * Initialize the global transition coordinator with context.
 */
export function initializeTransitionCoordinator(context: TransitionHandlerContext): void {
  coordinatorInstance = new TransitionCoordinator(context);
}
