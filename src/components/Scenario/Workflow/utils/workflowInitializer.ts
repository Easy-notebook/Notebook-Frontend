/**
 * Workflow Initializer
 * ====================
 *
 * Centralized initialization for all workflow components.
 * Ensures proper dependency injection and integration.
 *
 * This should be called once at app startup to wire everything together:
 * - WorkflowStateMachine
 * - AsyncStateMachineAdapter
 * - TransitionCoordinator
 * - ScriptStore
 * - API Client
 *
 * @author Hu Silan
 * @project Easy-notebook
 */

import { initializeStateMachine } from '../store/workflowStateMachine';
import { AsyncStateMachineAdapter } from '../core/AsyncStateMachineAdapter';
import { useScriptStore } from '../store/useScriptStore';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
import { getWorkflowAPIClient, initializeWorkflowAPIClient } from '../api/WorkflowAPIClient';

// Global singleton instance
let globalAsyncAdapter: AsyncStateMachineAdapter | null = null;

/**
 * Initialize the entire workflow system
 *
 * @param apiClientConfig - Optional configuration for WorkflowAPIClient
 * @returns The initialized AsyncStateMachineAdapter instance
 */
export function initializeWorkflowSystem(apiClientConfig?: {
  baseURL?: string;
  timeout?: number;
}): AsyncStateMachineAdapter {
  console.log('[WorkflowInit] Initializing workflow system...');

  // Initialize WorkflowAPIClient (VDSAgents client at port 28600)
  let workflowAPIClient;
  if (apiClientConfig) {
    workflowAPIClient = initializeWorkflowAPIClient(apiClientConfig);
    console.log(
      `[WorkflowInit] WorkflowAPIClient initialized with custom config:`,
      apiClientConfig
    );
  } else {
    workflowAPIClient = getWorkflowAPIClient();
    console.log(
      '[WorkflowInit] WorkflowAPIClient initialized with default config (localhost:28600)'
    );
  }

  // Get scriptStore instance
  const scriptStore = useScriptStore.getState();
  console.log('[WorkflowInit] ScriptStore obtained');

  // Initialize the state machine and transition coordinator
  initializeStateMachine({
    scriptStore,
    apiClient: workflowAPIClient,
  });
  console.log('[WorkflowInit] StateMachine and TransitionCoordinator initialized');

  // Create AsyncStateMachineAdapter with WorkflowAPIClient
  const asyncAdapter = new AsyncStateMachineAdapter(workflowAPIClient, scriptStore);
  globalAsyncAdapter = asyncAdapter;
  console.log('[WorkflowInit] AsyncStateMachineAdapter created with WorkflowAPIClient');

  // Verify integration
  const coordinator = getTransitionCoordinator();
  const context = coordinator.getContext();
  console.log('[WorkflowInit] Coordinator context:', {
    hasScriptStore: !!context.scriptStore,
    hasApiClient: !!context.apiClient,
  });

  console.log('✅ [WorkflowInit] Workflow system initialized successfully');
  console.log('   - VDSAgents API Client: Ready (port 28600)');
  console.log('   - AsyncStateMachineAdapter: Ready');
  console.log('   - TransitionCoordinator: Ready');
  console.log('   - ScriptStore: Ready');

  return asyncAdapter;
}

/**
 * Get the global AsyncStateMachineAdapter instance
 *
 * @returns The AsyncStateMachineAdapter instance or null if not initialized
 */
export function getAsyncAdapter(): AsyncStateMachineAdapter | null {
  if (!globalAsyncAdapter) {
    console.warn(
      '[WorkflowInit] AsyncStateMachineAdapter not initialized. Call initializeWorkflowSystem first.'
    );
  }
  return globalAsyncAdapter;
}

/**
 * Update the API client for all workflow components
 *
 * @param apiClient - The new API client
 */
export function updateAPIClient(apiClient: any): void {
  console.log('[WorkflowInit] Updating API client...');

  // Update AsyncStateMachineAdapter
  if (globalAsyncAdapter) {
    globalAsyncAdapter.setApiClient(apiClient);
  }

  // Update TransitionCoordinator
  const coordinator = getTransitionCoordinator();
  coordinator.setContext({ apiClient });

  console.log('✅ [WorkflowInit] API client updated');
}

/**
 * Verify workflow system is properly initialized
 *
 * @returns Object with initialization status
 */
export function verifyWorkflowSystemInit(): {
  initialized: boolean;
  hasAsyncAdapter: boolean;
  hasScriptStore: boolean;
  hasCoordinator: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check AsyncStateMachineAdapter
  const hasAsyncAdapter = globalAsyncAdapter !== null;
  if (!hasAsyncAdapter) {
    issues.push('AsyncStateMachineAdapter not initialized');
  }

  // Check ScriptStore
  const scriptStore = useScriptStore.getState();
  const hasScriptStore = scriptStore !== null && typeof scriptStore.execAction === 'function';
  if (!hasScriptStore) {
    issues.push('ScriptStore not properly initialized');
  }

  // Check TransitionCoordinator
  let hasCoordinator = false;
  try {
    const coordinator = getTransitionCoordinator();
    const context = coordinator.getContext();
    hasCoordinator = !!context;

    if (!context.scriptStore) {
      issues.push('TransitionCoordinator missing scriptStore');
    }
  } catch (error) {
    issues.push('TransitionCoordinator not initialized');
  }

  const initialized = issues.length === 0;

  const status = {
    initialized,
    hasAsyncAdapter,
    hasScriptStore,
    hasCoordinator,
    issues,
  };

  console.log('[WorkflowInit] Verification:', status);

  return status;
}

/**
 * Test action execution through the workflow system
 *
 * @param testAction - Optional test action, uses default if not provided
 */
export async function testWorkflowActionExecution(testAction?: any): Promise<void> {
  console.log('[WorkflowInit] Testing action execution...');

  const verification = verifyWorkflowSystemInit();
  if (!verification.initialized) {
    console.error('[WorkflowInit] System not initialized:', verification.issues);
    throw new Error('Workflow system not initialized: ' + verification.issues.join(', '));
  }

  const scriptStore = useScriptStore.getState();

  const action = testAction || {
    action: 'add',
    shotType: 'text',
    content: '# Test Cell from Workflow Initializer',
    metadata: {},
  };

  try {
    console.log('[WorkflowInit] Executing test action:', action);
    const result = await scriptStore.execAction(action);
    console.log('✅ [WorkflowInit] Test action executed successfully:', result);
  } catch (error) {
    console.error('❌ [WorkflowInit] Test action failed:', error);
    throw error;
  }
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).workflowInit = {
    initialize: initializeWorkflowSystem,
    getAdapter: getAsyncAdapter,
    updateAPIClient,
    verify: verifyWorkflowSystemInit,
    testExecution: testWorkflowActionExecution,
  };

  console.log('💡 Workflow initializer available via window.workflowInit');
}

export default {
  initializeWorkflowSystem,
  getAsyncAdapter,
  updateAPIClient,
  verifyWorkflowSystemInit,
  testWorkflowActionExecution,
};
