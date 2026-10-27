import { afterEach, expect, it, vi } from 'vitest';
import { AsyncStateMachineAdapter } from './AsyncStateMachineAdapter';
import { StateFactory } from '../states/StateFactory';
import { WorkflowState } from '../observation/WorkflowState';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';

vi.mock('@/interfaces/globalUpdateInterface', () => ({
  default: { getNotebookState: () => ({ notebook_id: 'a', cells: [], cell_count: 0, title: '' }) },
}));

function client() {
  return {
    callPlanningAPI: vi.fn(async function* () {
      yield { action: { type: 'planned' } };
    }),
    callGeneratingAPI: vi.fn(async function* () {
      yield { type: 'generated' };
    }),
    callReflectingAPI: vi.fn(async function* () {
      yield { type: 'reflected' };
    }),
  };
}

afterEach(() => {
  StateFactory.clearCache();
  StateFactory.setApiClient(client());
  getTransitionCoordinator().setContext({ apiClient: undefined, scriptStore: undefined });
});

it('uses the constructor client for both cached and subsequently created states', async () => {
  const oldClient = client();
  StateFactory.setApiClient(oldClient);
  const cached = StateFactory.getState('IDLE')!;
  const nextClient = client();
  new AsyncStateMachineAdapter(nextClient);
  const signal = new AbortController().signal;
  const planning = await cached.callAPI(WorkflowState.create(), undefined, signal);
  expect((await planning.next()).value).toEqual({ type: 'planned' });
  const generating = await StateFactory.getState('BEHAVIOR_RUNNING')!.callAPI(
    WorkflowState.create(),
    undefined,
    signal
  );
  expect((await generating.next()).value).toEqual({ type: 'generated' });
  expect(nextClient.callPlanningAPI).toHaveBeenCalledWith(expect.any(Object), signal);
  expect(nextClient.callGeneratingAPI).toHaveBeenCalledWith(expect.any(Object), signal);
  expect(oldClient.callPlanningAPI).not.toHaveBeenCalled();
  expect(oldClient.callGeneratingAPI).not.toHaveBeenCalled();
  expect(getTransitionCoordinator().getContext().apiClient).toBe(nextClient);
});

it('preserves an installed script store when only a client is supplied', () => {
  const scriptStore = { execAction: vi.fn().mockResolvedValue(undefined) };
  getTransitionCoordinator().setContext({ scriptStore });
  new AsyncStateMachineAdapter(client());
  expect(getTransitionCoordinator().getContext().scriptStore).toBe(scriptStore);
});

it('preserves an installed client when only a script store is supplied', () => {
  const apiClient = client();
  getTransitionCoordinator().setContext({ apiClient });
  const scriptStore = { execAction: vi.fn().mockResolvedValue(undefined) };
  new AsyncStateMachineAdapter(undefined, scriptStore);
  expect(getTransitionCoordinator().getContext().apiClient).toBe(apiClient);
  expect(getTransitionCoordinator().getContext().scriptStore).toBe(scriptStore);
});
