/**
 * Action Execution Test Utility
 * ==============================
 *
 * This file provides utilities to test action execution at the component/function level.
 * Use this to verify that actions from the backend can be properly executed.
 *
 * Usage:
 * ```typescript
 * import { testActionExecution, testActionFlow } from './action-execution-test';
 *
 * // Test single action
 * await testActionExecution({
 *   action: 'add',
 *   shotType: 'text',
 *   content: 'Hello World',
 *   metadata: {}
 * });
 *
 * // Test action flow (multiple actions)
 * await testActionFlow([
 *   { action: 'add', shotType: 'text', content: '# Chapter 1' },
 *   { action: 'add', shotType: 'action', content: 'print("Hello")' },
 *   { action: 'exec', codecell_id: 'lastAddedCellId' }
 * ]);
 * ```
 */

import { useScriptStore } from '../store/useScriptStore';
import type { ExecutionStep } from '@Store/models';

/**
 * Test single action execution
 *
 * @param action - The action to execute
 * @returns Promise resolving when action completes
 */
export async function testActionExecution(action: ExecutionStep): Promise<any> {
  console.group(`[ActionTest] Testing action: ${action.action}`);
  console.log('Action data:', action);

  try {
    const scriptStore = useScriptStore.getState();
    const result = await scriptStore.execAction(action);

    console.log('✅ Action executed successfully');
    console.log('Result:', result);
    console.groupEnd();

    return result;
  } catch (error) {
    console.error('❌ Action execution failed:', error);
    console.groupEnd();
    throw error;
  }
}

/**
 * Test a flow of multiple actions
 *
 * @param actions - Array of actions to execute in sequence
 * @returns Promise resolving when all actions complete
 */
export async function testActionFlow(actions: ExecutionStep[]): Promise<void> {
  console.group(`[ActionTest] Testing action flow (${actions.length} actions)`);

  const results: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    console.log(`\n[${i + 1}/${actions.length}] Executing: ${action.action}`);

    try {
      const result = await testActionExecution(action);
      results.push({ action: action.action, result, success: true });
    } catch (error) {
      errors.push({ action: action.action, error, success: false });
    }

    // Small delay between actions
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('\n📊 Flow Summary:');
  console.log(`  ✅ Successful: ${results.filter((r) => r.success).length}`);
  console.log(`  ❌ Failed: ${errors.length}`);

  if (errors.length > 0) {
    console.error('  Failed actions:', errors);
  }

  console.groupEnd();

  if (errors.length > 0) {
    throw new Error(`${errors.length} action(s) failed in flow`);
  }
}

/**
 * Create a mock action for testing
 */
export function createMockAction(
  type: string,
  overrides: Partial<ExecutionStep> = {}
): ExecutionStep {
  const baseActions: Record<string, ExecutionStep> = {
    'add-text': {
      action: 'add',
      shotType: 'text',
      content: '# Test Text Cell',
      metadata: {},
    },
    'add-code': {
      action: 'add',
      shotType: 'action',
      content: 'print("Hello from test")',
      metadata: {},
    },
    thinking: {
      action: 'is_thinking',
      textArray: ['AI is processing...', 'Analyzing data...'],
      agentName: 'TestAgent',
    },
    exec: {
      action: 'exec',
      codecell_id: 'lastAddedCellId',
      need_output: true,
    },
    chapter: {
      action: 'new_chapter',
      content: 'Test Chapter',
      metadata: { isChapter: true },
    },
    section: {
      action: 'new_section',
      content: 'Test Section',
      metadata: { isSection: true },
    },
  };

  const base = baseActions[type] || baseActions['add-text'];
  return { ...base, ...overrides };
}

/**
 * Test backend-like action stream
 *
 * Simulates actions as they would come from the backend API
 */
export async function testBackendActionStream(): Promise<void> {
  console.log('🧪 Testing Backend-like Action Stream\n');

  const actions: ExecutionStep[] = [
    createMockAction('chapter', { content: 'Chapter 1: Introduction' }),
    createMockAction('add-text', { content: 'This is the introduction section.' }),
    createMockAction('section', { content: 'Section 1.1: Background' }),
    createMockAction('add-text', { content: 'Some background information...' }),
    createMockAction('add-code', { content: 'import pandas as pd\ndf = pd.DataFrame()' }),
  ];

  await testActionFlow(actions);
}

/**
 * Verify action execution capabilities
 *
 * Run a comprehensive test of all action types
 */
export async function verifyActionExecutionCapabilities(): Promise<void> {
  console.log('🔍 Verifying Action Execution Capabilities\n');

  const testCases = [
    {
      name: 'Text Cell Creation',
      action: createMockAction('add-text'),
    },
    {
      name: 'Code Cell Creation',
      action: createMockAction('add-code'),
    },
    {
      name: 'Chapter Creation',
      action: createMockAction('chapter'),
    },
    {
      name: 'Section Creation',
      action: createMockAction('section'),
    },
    {
      name: 'Thinking Cell',
      action: createMockAction('thinking'),
    },
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`\n📝 Testing: ${testCase.name}`);
    try {
      await testActionExecution(testCase.action);
      results.push({ name: testCase.name, status: 'PASS' });
    } catch (error) {
      results.push({ name: testCase.name, status: 'FAIL', error });
    }
  }

  console.log('\n📊 Test Results:');
  console.table(results);

  const failedTests = results.filter((r) => r.status === 'FAIL');
  if (failedTests.length > 0) {
    throw new Error(`${failedTests.length} test(s) failed`);
  }
}

// Export for window (browser console access)
if (typeof window !== 'undefined') {
  (window as any).actionTest = {
    testActionExecution,
    testActionFlow,
    createMockAction,
    testBackendActionStream,
    verifyActionExecutionCapabilities,
  };

  console.log('💡 Action testing utilities available via window.actionTest');
}
