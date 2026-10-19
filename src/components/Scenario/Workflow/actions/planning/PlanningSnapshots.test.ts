import { afterEach, expect, it } from 'vitest';
import { createInitialStateJSON, WorkflowState, type ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { getActionClass } from '../index';
const original = useWorkflowStateMachine.getState();
afterEach(() => useWorkflowStateMachine.setState(original, true));
function setup(status = WorkflowState.STAGE_RUNNING) {
  const state = createInitialStateJSON();
  state.state.FSM.state = status;
  state.observation.location.current.stage_id = 'a';
  state.observation.location.progress.stages.planned = [
    { stage_id: 'a', title: 'Stage', task: 'Task', acceptance: 'Done', planning_complete: false },
  ];
  state.observation.location.progress.steps.planned = [
    { step_id: 's', title: 'Step', task: 'Task', acceptance: 'Done', planning_complete: false },
  ];
  useWorkflowStateMachine.setState({ stateJSON: state, currentState: status });
  return state;
}
const cases: { step: ExecutionStep; status: WorkflowState }[] = [
  {
    step: { action: 'plan_stage', stage_id: 'b', title: 'Next', task: 'Work', acceptance: 'Done' },
    status: WorkflowState.IDLE,
  },
  {
    step: { action: 'plan_step', step_id: 'next', title: 'Next', task: 'Work', acceptance: 'Done' },
    status: WorkflowState.STAGE_RUNNING,
  },
  {
    step: { action: 'update_stage_context', stage_id: 'a', focus: 'New focus', notes: 'New notes' },
    status: WorkflowState.STAGE_RUNNING,
  },
  {
    step: { action: 'complete_stage_planning', stage_id: 'a' },
    status: WorkflowState.STAGE_RUNNING,
  },
  { step: { action: 'complete_step_planning', step_id: 's' }, status: WorkflowState.STEP_RUNNING },
  { step: { action: 'complete_behavior' }, status: WorkflowState.BEHAVIOR_RUNNING },
  {
    step: {
      action: 'delegate_task',
      step_id: 's',
      agent: 'Worker',
      task_description: 'Work',
      acceptance: 'Done',
    } as ExecutionStep,
    status: WorkflowState.STEP_RUNNING,
  },
];
it.each(cases)(
  'publishes $step.action without modifying earlier snapshots',
  async ({ step, status }) => {
    const previous = setup(status);
    const copy = structuredClone(previous);
    const Action = getActionClass(step.action)!;
    await new Action({}).execute(step);
    const current = useWorkflowStateMachine.getState();
    expect(current.stateJSON).not.toBe(previous);
    expect(previous).toEqual(copy);
    expect(current.currentState).toBe(current.stateJSON.state.FSM.state);
  }
);
it('does not mark a stage planned without steps and allows a later valid retry', async () => {
  const previous = setup();
  previous.observation.location.progress.steps.planned = [];
  const store = useWorkflowStateMachine.getState();
  const Complete = getActionClass('complete_stage_planning')!;
  await new Complete({}).execute({ action: 'complete_stage_planning', stage_id: 'a' });
  expect(useWorkflowStateMachine.getState()).toBe(store);
  expect(previous.observation.location.progress.stages.planned?.[0].planning_complete).toBe(false);
  const Plan = getActionClass('plan_step')!;
  await new Plan({}).execute({
    action: 'plan_step',
    step_id: 's',
    title: 'Step',
    task: 'Task',
    acceptance: 'Done',
  });
  await new Complete({}).execute({ action: 'complete_stage_planning', stage_id: 'a' });
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.STEP_RUNNING);
  expect(
    useWorkflowStateMachine.getState().stateJSON.observation.location.progress.stages.planned?.[0]
      .planning_complete
  ).toBe(true);
});
it('does not invalidate ownership for a no-op behavior completion', async () => {
  setup(WorkflowState.IDLE);
  const before = useWorkflowStateMachine.getState();
  const Complete = getActionClass('complete_behavior')!;
  await new Complete({}).execute({ action: 'complete_behavior' });
  expect(useWorkflowStateMachine.getState()).toBe(before);
});
it('discards partial draft changes when a synchronous update throws', () => {
  setup();
  const before = useWorkflowStateMachine.getState();
  expect(() =>
    before.updateState((draft) => {
      draft.state.FSM.state = WorkflowState.COMPLETE;
      throw new Error('Cannot apply update');
    })
  ).toThrow('Cannot apply update');
  expect(useWorkflowStateMachine.getState()).toBe(before);
  expect(before.stateJSON.state.FSM.state).toBe(WorkflowState.STAGE_RUNNING);
});
