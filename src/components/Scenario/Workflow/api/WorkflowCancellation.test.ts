import { afterEach, expect, it, vi } from 'vitest';
import { WorkflowState } from '../observation/WorkflowState';
import { IdleState } from '../states/IdleState';
import { BehaviorRunningState } from '../states/BehaviorRunningState';
import { BehaviorCompletedState } from '../states/BehaviorCompletedState';
import { WorkflowAPIClient } from './WorkflowAPIClient';
vi.mock('@/interfaces/globalUpdateInterface', () => ({
  default: { getNotebookState: () => ({ notebook_id: 'a', cells: [], cell_count: 0, title: '' }) },
}));
afterEach(() => vi.unstubAllGlobals());
it.each([IdleState, BehaviorRunningState, BehaviorCompletedState])(
  'forwards cancellation through %s and its handler to fetch',
  async (State) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetch = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetch);
    const state = new State();
    state.setApiClient(new WorkflowAPIClient());
    const abort = new AbortController();
    const iterator = await state.callAPI(WorkflowState.create(), undefined, abort.signal);
    const pending = iterator.next();
    await vi.waitFor(() => expect(body.locked).toBe(true));
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await assertion;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  }
);
