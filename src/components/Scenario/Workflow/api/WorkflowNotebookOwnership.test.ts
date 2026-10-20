import { afterEach, expect, it, vi } from 'vitest';
import { PlanningAPIHandler } from './PlanningAPIHandler';
import { GeneratingAPIHandler } from './GeneratingAPIHandler';
import { ReflectingAPIHandler } from './ReflectingAPIHandler';
import { WorkflowState } from '../observation/WorkflowState';

const { notebook } = vi.hoisted(() => ({ notebook: vi.fn() }));
vi.mock('@/interfaces/globalUpdateInterface', () => ({ default: { getNotebookState: notebook } }));
afterEach(() => vi.clearAllMocks());
const handlers = [PlanningAPIHandler, GeneratingAPIHandler, ReflectingAPIHandler];
function client() {
  return {
    callPlanningAPI: vi.fn(async function* () {}),
    callGeneratingAPI: vi.fn(async function* () {}),
    callReflectingAPI: vi.fn(async function* () {}),
  };
}
function snapshot(id: string | null) {
  return { notebook_id: id, title: 'Current notebook', cells: [], cell_count: 0 };
}

it.each(handlers)(
  '%s rejects another notebook before changing state or requesting data',
  async (Handler) => {
    for (const current of ['other', null]) {
      notebook.mockReturnValue(snapshot(current));
      const state = WorkflowState.create();
      state.state.notebook.setNotebookId('owner');
      const before = state.toJSON();
      const api = client();
      const iterator = new Handler(api).call(state);
      await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
      expect(state.toJSON()).toEqual(before);
      for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
    }
  }
);

it.each(handlers)(
  '%s synchronizes the owning notebook and binds an unassigned state',
  async (Handler) => {
    for (const initial of ['owner', null]) {
      notebook.mockReturnValue(snapshot('owner'));
      const state = WorkflowState.create();
      state.state.notebook.setNotebookId(initial);
      const api = client();
      await new Handler(api).call(state).next();
      expect(state.state.notebook.id).toBe('owner');
      expect(state.state.notebook.title).toBe('Current notebook');
      expect(Object.values(api).reduce((count, call) => count + call.mock.calls.length, 0)).toBe(1);
    }
  }
);
