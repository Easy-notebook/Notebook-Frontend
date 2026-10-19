import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON } from '@Store/models';
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
