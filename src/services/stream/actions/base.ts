/**
 * Stream Action Base Class - Foundation for all stream action handlers
 *
 * Follows the same pattern as Workflow actions for consistency
 */

import type { StreamActionContext } from '../types';

/**
 * Base class for all stream action handlers.
 *
 * Each action class:
 * - Defines its actionType as a static property
 * - Implements the execute() method
 * - Gets automatically registered via registerAction()
 */
export abstract class StreamAction {
  /** Action type identifier (matches stream data type) */
  static actionType: string;

  /**
   * Execute the stream action.
   *
   * @param context - The stream action context containing data and utilities
   * @returns Result of the action execution
   */
  abstract execute(context: StreamActionContext): Promise<void> | void;

  /**
   * Allow action to be called directly
   */
  call(context: StreamActionContext): Promise<void> | void {
    return this.execute(context);
  }
}

/**
 * Registry of all stream action classes
 */
const _streamActionRegistry: Map<string, typeof StreamAction> = new Map();

/**
 * Register a stream action class.
 *
 * @param actionType - The action type identifier (matches stream type)
 * @param actionClass - The action class to register
 */
export function registerStreamAction(actionType: string, actionClass: typeof StreamAction): void {
  actionClass.actionType = actionType;
  _streamActionRegistry.set(actionType, actionClass);
  console.log(`[StreamActions] Registered action: ${actionType}`);
}

/**
 * Get the action class for a given stream type.
 *
 * @param actionType - The stream type identifier
 * @returns The action class, or undefined if not found
 */
export function getStreamActionClass(actionType: string): typeof StreamAction | undefined {
  return _streamActionRegistry.get(actionType);
}

/**
 * Get all registered stream action types.
 *
 * @returns Array of action type identifiers
 */
export function getAllStreamActionTypes(): string[] {
  return Array.from(_streamActionRegistry.keys());
}

/**
 * Clear all registered actions (useful for testing).
 */
export function clearStreamRegistry(): void {
  _streamActionRegistry.clear();
}

/**
 * Get the entire registry (for debugging)
 */
export function getStreamRegistry(): Map<string, typeof StreamAction> {
  return _streamActionRegistry;
}
