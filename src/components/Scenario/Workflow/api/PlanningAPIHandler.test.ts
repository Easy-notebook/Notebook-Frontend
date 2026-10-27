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

it('streams planning payloads in order without executing notebook actions', async () => {
  const actions = [
    { type: 'update_title', content: 'Analysis' },
    { type: 'plan_stage', stage_id: 'a' },
    { type: 'complete_workflow_planning', total_stages: 1 },
  ];
  const client: WorkflowAPIClientPort = {
    async *callPlanningAPI() {
      for (const action of actions) yield { action };
    },
    callGeneratingAPI: vi.fn(),
    callReflectingAPI: vi.fn(),
  };
  const execAction = vi.fn();
  const received = [];
  for await (const action of new PlanningAPIHandler(client, { execAction }).call(
    WorkflowState.create()
  )) {
    received.push(action);
  }
  expect(received).toEqual(actions);
  expect(execAction).not.toHaveBeenCalled();
});
