/**
 * State Factory
 * =============
 *
 * Ported from: ref/Notebook-BCC/core/state_classes/state_factory.py
 *
 * Creates and manages state instances for the workflow state machine.
 *
 * Implements singleton pattern for state instances to avoid recreation.
 */

import { BaseState } from './BaseState';
import { IdleState } from './IdleState';
import { StageRunningState } from './StageRunningState';
import { StageCompletedState } from './StageCompletedState';
import { StepRunningState } from './StepRunningState';
import { StepCompletedState } from './StepCompletedState';
import { BehaviorRunningState } from './BehaviorRunningState';
import { BehaviorCompletedState } from './BehaviorCompletedState';
import { WorkflowState } from '../store/workflowStateMachine';

type StateClass = new () => BaseState;

/**
 * Factory for creating and managing state instances.
 */
export class StateFactory {
  // State class registry
  private static STATE_CLASSES: Record<string, StateClass> = {
    IDLE: IdleState,
    STAGE_RUNNING: StageRunningState,
    STAGE_COMPLETED: StageCompletedState,
    STEP_RUNNING: StepRunningState,
    STEP_COMPLETED: StepCompletedState,
    BEHAVIOR_RUNNING: BehaviorRunningState,
    BEHAVIOR_COMPLETED: BehaviorCompletedState,
  };

  // Singleton instances cache
  private static instances: Record<string, BaseState> = {};

  // Global API client (injected once, shared by all states)
  private static apiClient: any = null;

  /**
   * Get or create a state instance.
   *
   * @param stateName - The state name (e.g., 'IDLE', 'STAGE_RUNNING')
   * @returns State instance, or null if state not found
   */
  static getState(stateName: string): BaseState | null {
    // Normalize state name
    stateName = this.normalizeStateName(stateName);

    // Return cached instance if exists
    if (this.instances[stateName]) {
      return this.instances[stateName];
    }

    // Create new instance
    const StateClass = this.STATE_CLASSES[stateName];
    if (!StateClass) {
      console.warn(`[StateFactory] State class not found for: ${stateName}`);
      return null;
    }

    const instance = new StateClass();

    // Inject API client if available
    if (this.apiClient) {
      instance.setApiClient(this.apiClient);
    }

    this.instances[stateName] = instance;
    console.log(`[StateFactory] Created state instance: ${stateName}`);
    return instance;
  }

  /**
   * Get state instance from WorkflowState enum.
   *
   * @param stateEnum - WorkflowState enum value
   * @returns State instance
   */
  static getStateFromEnum(stateEnum: WorkflowState): BaseState | null {
    const stateName = stateEnum.toUpperCase();
    return this.getState(stateName);
  }

  /**
   * Clear the instances cache.
   */
  static clearCache(): void {
    this.instances = {};
    console.log('[StateFactory] Cache cleared');
  }

  /**
   * Normalize state name to uppercase format.
   *
   * Examples:
   *   'idle' -> 'IDLE'
   *   'stage_running' -> 'STAGE_RUNNING'
   *   'STATE_Behavior_Running' -> 'BEHAVIOR_RUNNING'
   */
  private static normalizeStateName(stateName: string): string {
    if (!stateName) {
      return stateName;
    }

    // Remove STATE_ prefix if present
    if (stateName.startsWith('STATE_')) {
      stateName = stateName.substring(6);
    }

    // Convert to uppercase and normalize separators
    stateName = stateName.toUpperCase().replace(/\s+/g, '_');

    return stateName;
  }

  /**
   * Get all available state instances.
   *
   * @returns Dict of state_name -> state_instance
   */
  static getAllStates(): Record<string, BaseState> {
    const states: Record<string, BaseState> = {};
    for (const name of Object.keys(this.STATE_CLASSES)) {
      const state = this.getState(name);
      if (state) {
        states[name] = state;
      }
    }
    return states;
  }

  /**
   * Check if a state is supported.
   *
   * @param stateName - The state name to check
   * @returns True if state is supported
   */
  static isStateSupported(stateName: string): boolean {
    stateName = this.normalizeStateName(stateName);
    return stateName in this.STATE_CLASSES;
  }

  /**
   * Set the global API client for all states.
   *
   * This should be called once during initialization to inject
   * the API client into all state instances.
   *
   * @param apiClient - WorkflowAPIClient instance
   */
  static setApiClient(apiClient: any): void {
    this.apiClient = apiClient;

    // Inject into existing instances
    for (const instance of Object.values(this.instances)) {
      instance.setApiClient(apiClient);
    }

    console.log('[StateFactory] API client injected into all state instances');
  }

  /**
   * Get list of all supported state names.
   */
  static getSupportedStates(): string[] {
    return Object.keys(this.STATE_CLASSES);
  }
}
