import { afterEach, expect, it, vi } from 'vitest';
import { getAsyncStateMachine, resetAsyncStateMachine } from '../core/AsyncStateMachineAdapter';
import { initializeWorkflowSystem, getAsyncAdapter, updateAPIClient } from './workflowInitializer';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
import { getWorkflowAPIClient } from '../api/WorkflowAPIClient';

afterEach(() => {
  resetAsyncStateMachine();
  vi.restoreAllMocks();
});

it('uses the startup adapter and configured client for automatic execution', async () => {
  resetAsyncStateMachine();
  const adapter = initializeWorkflowSystem({
    baseURL: 'https://workflow.example.test',
    timeout: 1234,
  });
  const configuredClient = getWorkflowAPIClient();
  expect(await getAsyncStateMachine()).toBe(adapter);
  expect(getAsyncAdapter()).toBe(adapter);
  expect(getTransitionCoordinator().getContext().apiClient).toBe(configuredClient);
});

it('lets synchronous startup satisfy an already pending lazy initialization', async () => {
  resetAsyncStateMachine();
  const pending = getAsyncStateMachine();
  const adapter = initializeWorkflowSystem();
  expect(await pending).toBe(adapter);
  expect(await getAsyncStateMachine()).toBe(adapter);
});

it('does not expose a stale startup adapter after reset', () => {
  initializeWorkflowSystem();
  resetAsyncStateMachine();
  expect(getAsyncAdapter()).toBeNull();
});

it('updates the client owned by the lazily initialized adapter', async () => {
  resetAsyncStateMachine();
  const adapter = await getAsyncStateMachine();
  expect(getAsyncAdapter()).toBe(adapter);
  const update = vi.spyOn(adapter, 'setApiClient');
  const client = getWorkflowAPIClient();
  updateAPIClient(client);
  expect(update).toHaveBeenCalledExactlyOnceWith(client);
});

it('preserves a client configured before the first lazy initialization', async () => {
  resetAsyncStateMachine();
  const client = {
    async *callPlanningAPI() {
      yield { action: { type: 'configured' } };
    },
    async *callGeneratingAPI() {
      yield { type: 'configured' };
    },
    async *callReflectingAPI() {
      yield { type: 'configured' };
    },
  };
  updateAPIClient(client);
  await getAsyncStateMachine();
  expect(getTransitionCoordinator().getContext().apiClient).toBe(client);
});
