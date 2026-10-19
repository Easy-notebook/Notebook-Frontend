import { expect, it, vi } from 'vitest';
import type { WorkflowAPIClientPort } from '@Store/models';
import { PlanningAPIHandler } from './PlanningAPIHandler';
import { WorkflowState } from '../observation/WorkflowState';

vi.mock('@/interfaces/globalUpdateInterface', () => ({
  default: { getNotebookState: () => ({ notebook_id: 'a', cells: [], cell_count: 0, title: '' }) },
}));

it('ignores non-action planning messages and preserves valid action payloads', async () => {
  const action = { type: 'plan_stage', stage_id: 'stage-1', task: 'Analyze data' };
  const client: WorkflowAPIClientPort = {
    async *callPlanningAPI() {
      for (const message of [
        null,
        false,
        'metadata',
        [],
        {},
        { action: null },
        { action: 'invalid' },
        { action: {} },
        { action },
      ]) {
        yield message;
      }
    },
    callGeneratingAPI: vi.fn(),
    callReflectingAPI: vi.fn(),
  };
  const received = [];
  for await (const item of new PlanningAPIHandler(client).call(WorkflowState.create())) {
    received.push(item);
  }
  expect(received).toEqual([action]);
  expect(received[0]).toBe(action);
});
