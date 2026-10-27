import { expect, it } from 'vitest';
import { WorkflowEvent } from '@Store/models';
import { IdleState } from './IdleState';
import { WorkflowState } from '../observation/WorkflowState';

it.each([
  { stages: [{ stage_id: 'a', title: 'Analysis' }] },
  { actions: [{ type: 'plan_stage', stage_id: 'a' }] },
  { actions: [{ type: 'complete_workflow_planning', total_stages: 1 }] },
])('recognizes a planning response: %j', (response) => {
  expect(new IdleState().determineNextTransition(WorkflowState.create(), response)).toBe(
    WorkflowEvent.START_WORKFLOW
  );
});

it.each([undefined, {}, { stages: [] }, { actions: [] }, { actions: [{ type: 'update_title' }] }])(
  'remains idle without a planning response: %j',
  (response) => {
    expect(new IdleState().determineNextTransition(WorkflowState.create(), response)).toBeNull();
  }
);
