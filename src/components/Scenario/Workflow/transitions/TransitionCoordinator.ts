/**
 * Transition Coordinator
 * Coordinates FSM state transitions using appropriate handlers.
 *
 * This is the main entry point for applying state transitions.
 * Ported from: ref/Notebook-BCC/core/transition_handlers/transition_coordinator.py
 */

import { BaseTransitionHandler } from './BaseTransitionHandler';
import type { TransitionHandlerContext } from '@Store/models';
import { StartWorkflowHandler } from './StartWorkflowHandler';
import { StartStepHandler } from './StartStepHandler';
import { StartBehaviorHandler } from './StartBehaviorHandler';
import { CompleteBehaviorHandler } from './CompleteBehaviorHandler';
import { NextBehaviorHandler } from './NextBehaviorHandler';
import { CompleteStepHandler } from './CompleteStepHandler';
import { NextStepHandler } from './NextStepHandler';
import { CompleteStageHandler } from './CompleteStageHandler';
import { NextStageHandler } from './NextStageHandler';
import { ReflectingAgainHandler } from './ReflectingAgainHandler';
import { CompleteWorkflowHandler } from './CompleteWorkflowHandler';
import { getStateFactory } from '../states/StateFactory';

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
      new CompleteWorkflowHandler(),
      new ReflectingAgainHandler(),
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
  async applyTransition(
    state: Record<string, unknown>,
    apiResponse: Record<string, unknown>,
    apiType?: string,
    autoTrigger = true
  ): Promise<{ state: Record<string, unknown>; transitionName: string }> {
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
    const updatedState = await handler.applyAndLog(state, apiResponse, apiType);

    console.log(`[Coordinator] Transition applied successfully: ${transitionName}`);

    // Auto-trigger next transition if enabled
    let finalState = updatedState;
    if (autoTrigger) {
      const autoResult = await this.autoTriggerNextTransition(updatedState);
      finalState = autoResult.state;
      if (autoResult.transitionName) {
        console.log(
          `[Coordinator] Auto-triggered follow-up transition: ${autoResult.transitionName}`
        );
      }
    }

    return { state: finalState, transitionName };
  }

  /**
   * Find the appropriate handler for the API response.
   */
  private findHandler(apiResponse: Record<string, unknown>): BaseTransitionHandler | null {
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
   * Uses State.determineNextTransition() to decide which transition to apply.
   *
   * Auto-trigger logic:
   * 1. BEHAVIOR_COMPLETED: ONLY auto-trigger if effect.current not empty → NEXT_BEHAVIOR
   *    - Otherwise needs Reflecting API or Planning API
   * 2. STEP_COMPLETED: Always auto-trigger NEXT_STEP or COMPLETE_STAGE
   * 3. STAGE_COMPLETED: Always auto-trigger NEXT_STAGE or COMPLETE_WORKFLOW
   *
   * States that ALWAYS need API calls:
   * - IDLE, STAGE_RUNNING, STEP_RUNNING, BEHAVIOR_RUNNING
   * These should be handled by AsyncStateMachineAdapter.step()
   */
  public async autoTriggerNextTransition(
    state: Record<string, unknown>
  ): Promise<{ state: Record<string, unknown>; transitionName: string | null }> {
    const currentStateName = (state as any).state?.FSM?.state;

    if (!currentStateName) {
      console.log('[Auto-Trigger] No current state name found');
      return { state, transitionName: null };
    }

    // States that ALWAYS require API calls - never auto-trigger
    const ALWAYS_API_DEPENDENT_STATES = [
      'IDLE',
      'STAGE_RUNNING',
      'STEP_RUNNING',
      'BEHAVIOR_RUNNING',
    ];

    if (ALWAYS_API_DEPENDENT_STATES.includes(currentStateName)) {
      console.log(
        `[Auto-Trigger] Skipping ${currentStateName} - always requires API call via AsyncStateMachineAdapter.step()`
      );
      return { state, transitionName: null };
    }

    // Special handling for BEHAVIOR_COMPLETED:
    // Only auto-trigger if effect.current is not empty (forcing NEXT_BEHAVIOR)
    // Otherwise it needs to call Reflecting API or Planning API
    if (currentStateName === 'BEHAVIOR_COMPLETED') {
      const context = (state as any).observation?.context || {};
      const effects = context.effects || {};
      const currentEffects = effects.current || [];

      if (currentEffects.length === 0) {
        console.log(
          '[Auto-Trigger] BEHAVIOR_COMPLETED with empty effect.current - needs API call via AsyncStateMachineAdapter.step()'
        );
        return { state, transitionName: null };
      }

      // effect.current is not empty, can auto-trigger NEXT_BEHAVIOR
      console.log(
        `[Auto-Trigger] BEHAVIOR_COMPLETED with ${currentEffects.length} effects in effect.current - auto-triggering NEXT_BEHAVIOR`
      );
    }

    // States that support auto-triggering
    const AUTO_TRIGGER_ALLOWED_STATES = ['BEHAVIOR_COMPLETED', 'STEP_COMPLETED', 'STAGE_COMPLETED'];

    if (!AUTO_TRIGGER_ALLOWED_STATES.includes(currentStateName)) {
      console.log(`[Auto-Trigger] State ${currentStateName} does not support auto-triggering`);
      return { state, transitionName: null };
    }

    // Get the State class instance for current state
    const stateFactory = getStateFactory();
    const stateClass = stateFactory.getState(currentStateName);

    if (!stateClass) {
      console.warn(`[Auto-Trigger] No State class found for ${currentStateName}`);
      return { state, transitionName: null };
    }

    // Ask the State class to determine the next transition
    // State.determineNextTransition() knows the business logic:
    // - BEHAVIOR_COMPLETED: checks effect.current (we already checked above)
    // - STEP_COMPLETED: checks planed steps
    // - STAGE_COMPLETED: checks planed stages
    const nextEvent = stateClass.determineNextTransition(state);

    if (!nextEvent) {
      console.log(`[Auto-Trigger] State ${currentStateName} has no next transition`);
      return { state, transitionName: null };
    }

    console.log(`[Auto-Trigger] ${currentStateName} determined next event: ${nextEvent}`);

    // Find handler for this transition
    const fromState = currentStateName;
    const handler = this.handlers.find((h) => {
      const handlerFrom = h.fromState.toUpperCase();
      const handlerEvent = h.transitionName.toUpperCase();
      return handlerFrom === fromState && handlerEvent.includes(nextEvent.toUpperCase());
    });

    if (!handler) {
      console.warn(`[Auto-Trigger] No handler found for ${fromState} + ${nextEvent}`);
      return { state, transitionName: null };
    }

    console.log(`[Auto-Trigger] Applying ${handler.constructor.name} for ${nextEvent}`);

    // Apply the transition (pass empty response since this is auto-triggered)
    const newState = await handler.apply(state, {});
    return { state: newState, transitionName: handler.transitionName };
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
