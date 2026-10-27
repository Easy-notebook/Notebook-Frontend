import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON, WorkflowState } from '@Store/models';
import { AsyncStateMachineAdapter } from './AsyncStateMachineAdapter';
import { StateFactory } from '../states/StateFactory';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
afterEach(() => vi.restoreAllMocks());
it('stops before consuming buffered successor actions after cancellation', async () => {
  const abort = new AbortController();
  const closed = vi.fn();
  async function* actions() {
    try {
      yield { type: 'first' };
      yield { type: 'second' };
    } finally {
      closed();
    }
  }
  vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI').mockResolvedValue(actions());
  const execAction = vi.fn(async () => {
    abort.abort();
  });
  const adapter = new AsyncStateMachineAdapter(undefined, { execAction });
  const transition = vi.spyOn(getTransitionCoordinator(), 'applyTransition');
  await expect(adapter.step(createInitialStateJSON(), abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(execAction).toHaveBeenCalledWith(expect.any(Object), abort.signal);
  expect(execAction).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
  expect(transition).not.toHaveBeenCalled();
});
it('rejects an already cancelled step before calling its API', async () => {
  const abort = new AbortController();
  abort.abort();
  const api = vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI');
  await expect(
    new AsyncStateMachineAdapter().step(createInitialStateJSON(), abort.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(api).not.toHaveBeenCalled();
});

it('propagates API failure to the owning run instead of reporting no transition', async () => {
  const failure = new Error('network unavailable');
  vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI').mockRejectedValue(failure);
  await expect(new AsyncStateMachineAdapter().step(createInitialStateJSON())).rejects.toBe(failure);
});

it('stops the stream and does not apply a transition after an action throws', async () => {
  const failure = new Error('cannot apply action');
  const closed = vi.fn();
  async function* actions() {
    try {
      yield { type: 'first' };
      yield { type: 'must-not-run' };
    } finally {
      closed();
    }
  }
  vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI').mockResolvedValue(actions());
  const execAction = vi.fn().mockRejectedValue(failure);
  const adapter = new AsyncStateMachineAdapter(undefined, { execAction });
  const transition = vi.spyOn(getTransitionCoordinator(), 'applyTransition');
  await expect(adapter.step(createInitialStateJSON())).rejects.toBe(failure);
  expect(execAction).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
  expect(transition).not.toHaveBeenCalled();
});

it('propagates a stream failure after earlier actions without completing the transition', async () => {
  const failure = new Error('connection interrupted');
  async function* actions() {
    yield { type: 'first' };
    throw failure;
  }
  vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI').mockResolvedValue(actions());
  const execAction = vi.fn().mockResolvedValue(undefined);
  const adapter = new AsyncStateMachineAdapter(undefined, { execAction });
  const transition = vi.spyOn(getTransitionCoordinator(), 'applyTransition');
  await expect(adapter.step(createInitialStateJSON())).rejects.toBe(failure);
  expect(execAction).toHaveBeenCalledOnce();
  expect(transition).not.toHaveBeenCalled();
});

it('forwards the run signal when a logic-only state automatically transitions', async () => {
  const abort = new AbortController();
  const auto = vi
    .spyOn(getTransitionCoordinator(), 'autoTriggerNextTransition')
    .mockImplementation(async (state) => ({ state, transitionName: null }));
  const snapshot = createInitialStateJSON();
  snapshot.state.FSM.state = WorkflowState.STEP_COMPLETED;
  await new AsyncStateMachineAdapter().step(snapshot, abort.signal);
  expect(auto).toHaveBeenCalledExactlyOnceWith(expect.any(Object), abort.signal);
});

it('closes the action stream and rejects before transition when no executor is installed', async () => {
  const closed = vi.fn();
  async function* actions() {
    try {
      yield { type: 'plan_stage', stage_id: 'a', title: 'Analysis' };
      yield { type: 'must-not-be-read' };
    } finally {
      closed();
    }
  }
  vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI').mockResolvedValue(actions());
  const coordinator = getTransitionCoordinator();
  const previous = coordinator.getContext().scriptStore;
  coordinator.setContext({ scriptStore: undefined });
  const transition = vi
    .spyOn(coordinator, 'applyTransition')
    .mockImplementation(async (state) => ({ state, transitionName: 'unexpected' }));
  try {
    await expect(new AsyncStateMachineAdapter().step(createInitialStateJSON())).rejects.toThrow(
      'Workflow action executor is not configured'
    );
    expect(closed).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
  } finally {
    coordinator.setContext({ scriptStore: previous });
  }
});
