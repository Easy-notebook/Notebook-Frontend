import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON } from '@Store/models';
import { AsyncStateMachineAdapter } from './AsyncStateMachineAdapter';
import { WorkflowStreamTrace } from './WorkflowStreamTrace';
import { StateFactory } from '../states/StateFactory';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';

afterEach(() => {
  vi.restoreAllMocks();
  getTransitionCoordinator().setContext({ scriptStore: undefined });
});

it.each(['completed', 'cancelled', 'failed'] as const)(
  'settles and reports a %s stream exactly once',
  async (outcome) => {
    const abort = new AbortController();
    const failure = new Error('transport failed');
    async function* actions() {
      yield { type: 'work' };
      if (outcome === 'failed') throw failure;
    }
    vi.spyOn(StateFactory.getState('IDLE')!, 'callAPI').mockResolvedValue(actions());
    const finish = vi.spyOn(WorkflowStreamTrace.prototype, 'finish');
    const report = vi
      .spyOn(WorkflowStreamTrace.prototype, 'printReport')
      .mockImplementation(() => {});
    vi.spyOn(getTransitionCoordinator(), 'applyTransition').mockImplementation(async (state) => ({
      state,
      transitionName: 'done',
    }));
    const adapter = new AsyncStateMachineAdapter(undefined, {
      execAction: async () => {
        if (outcome === 'cancelled') abort.abort();
      },
    });
    const result = adapter.step(createInitialStateJSON(), abort.signal);
    if (outcome === 'completed') await result;
    else if (outcome === 'failed') await expect(result).rejects.toBe(failure);
    else await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(finish).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(report).toHaveBeenCalledOnce();
    const trace = finish.mock.instances[0];
    expect(trace).toBeInstanceOf(WorkflowStreamTrace);
    if (!(trace instanceof WorkflowStreamTrace)) throw new Error('Missing stream trace');
    const snapshot = trace.snapshot();
    expect(snapshot.phase).toBe(outcome);
    expect(snapshot.endTime).toBeDefined();
    expect(snapshot.actions[0].phase).toBe(outcome === 'cancelled' ? 'cancelled' : 'completed');
  }
);
