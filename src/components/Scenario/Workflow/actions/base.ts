/**
 * Action Base Class - Foundation for all action handlers
 * Ported from: ref/Notebook-BCC/actions/base.py
 *
 * Provides decorator-based registration and standard execution interface.
 */

import type { ExecutionStep } from '@Store/models';

/**
 * Base class for all action handlers.
 *
 * Each action class:
 * - Defines its actionType as a static property
 * - Implements the execute() method
 * - Gets automatically registered via the @action decorator
 */
export abstract class ActionBase {
  /** Action type identifier (set by decorator) */
  static actionType: string;

  /** Reference to script store */
  protected scriptStore: any;

  constructor(scriptStore: any) {
    this.scriptStore = scriptStore;
  }

  /**
   * Execute the action.
   *
   * @param step - The execution step containing action parameters
   * @returns Result of the action execution
   */
  abstract execute(step: ExecutionStep): Promise<any> | any;

  /**
   * Allow action to be called directly
   */
  call(step: ExecutionStep): Promise<any> | any {
    return this.execute(step);
  }
}

/**
 * Registry of all action classes
 */
const _actionRegistry: Map<string, typeof ActionBase> = new Map();

/**
 * Register an action class.
 *
 * @param actionType - The action type identifier (e.g., 'add', 'exec')
 * @param actionClass - The action class to register
 *
 * Usage:
 *   class AddAction extends ActionBase {
 *     execute(step: ExecutionStep): any {
 *       // Implementation
 *     }
 *   }
 *   registerAction('add', AddAction);
 */
export function registerAction(actionType: string, actionClass: typeof ActionBase): void {
  // Set the action_type on the class
  actionClass.actionType = actionType;

  // Register the class
  _actionRegistry.set(actionType, actionClass);

  console.log(`[Actions] Registered action: ${actionType}`);
}

/**
 * Decorator to register an action class (for compatibility, but not recommended).
 * Note: Decorators require experimental TypeScript features.
 * Use registerAction() instead for better compatibility.
 */
export function action(actionType: string) {
  return function <T extends typeof ActionBase>(constructor: T): T {
    registerAction(actionType, constructor);
    return constructor;
  };
}

/**
 * Get the action class for a given action type.
 *
 * @param actionType - The action type identifier
 * @returns The action class constructor, or undefined if not found
 */
export function getActionClass(
  actionType: string
): (new (scriptStore: any) => ActionBase) | undefined {
  return _actionRegistry.get(actionType) as (new (scriptStore: any) => ActionBase) | undefined;
}

/**
 * Get all registered action types.
 *
 * @returns Array of action type identifiers
 */
export function getAllActionTypes(): string[] {
  return Array.from(_actionRegistry.keys());
}

/**
 * Clear all registered actions (useful for testing).
 */
export function clearRegistry(): void {
  _actionRegistry.clear();
}

/**
 * Get the entire registry (for debugging)
 */
export function getRegistry(): Map<string, typeof ActionBase> {
  return _actionRegistry;
}

/**
 * Execute an action by type with parameters.
 * This is a convenience function that creates an action instance and executes it.
 *
 * @param actionType - The action type identifier
 * @param params - Parameters to pass to the action (can be a simple value or execution step)
 * @returns Result of the action execution
 */
export async function executeAction(actionType: string, params?: any): Promise<any> {
  const ActionClass = getActionClass(actionType);

  if (!ActionClass) {
    console.warn(`[executeAction] Unknown action type: ${actionType}`);
    return;
  }

  // Dynamically import script store to avoid circular dependencies
  const { useScriptStore } = await import('../store/useScriptStore');
  const scriptStore = useScriptStore.getState();

  // Create action instance
  // @ts-expect-error ActionClass is a concrete class, not abstract
  const action = new ActionClass(scriptStore);

  // Convert params to ExecutionStep format if it's a simple value
  let step: ExecutionStep;
  if (typeof params === 'string' || typeof params === 'number') {
    step = {
      action: actionType,
      content: String(params),
    } as ExecutionStep;
  } else if (params && typeof params === 'object' && 'action' in params) {
    step = params as ExecutionStep;
  } else {
    step = {
      action: actionType,
      ...params,
    } as ExecutionStep;
  }

  // Execute action
  return await action.execute(step);
}
