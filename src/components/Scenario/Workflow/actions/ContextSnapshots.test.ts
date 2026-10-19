import { afterEach, expect, it } from 'vitest';
import { createInitialStateJSON, WorkflowState, type ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';
import { useWorkflowStateMachine } from '../store/workflowStateMachine';
import { getActionClass } from './index';
const original = useWorkflowStateMachine.getState();
const notebook = useNotebookStore.getState();
afterEach(() => {
  useWorkflowStateMachine.setState(original, true);
  useNotebookStore.setState(notebook, true);
});
function setup() {
  const snapshot = createInitialStateJSON();
  snapshot.state.FSM.state = WorkflowState.BEHAVIOR_COMPLETED;
  snapshot.state.effects = {
    current: [{ type: 'text', text: 'new output' }],
    history: [{ type: 'text', text: 'previous output' }],
  };
  snapshot.agents = {
    Worker: {
      task: { current: 'old task', history: [] },
      thinking: { current: null, history: [] },
      conclusion: { current: null, history: [] },
    },
  };
  useWorkflowStateMachine.setState({
    stateJSON: snapshot,
    currentState: WorkflowState.BEHAVIOR_COMPLETED,
  });
  useNotebookStore.setState({ cells: [] });
  return snapshot;
}
const cases = [
  {
    action: 'update_agent',
    agent_id: 'Worker',
    section: 'task',
    content: 'new task',
    archive: true,
  },
  {
    action: 'update_progress',
    type: 'stage',
    id: 'a',
    status: 'completed',
    data: { title: 'Finished' },
  },
  { action: 'update_location', stage_id: 'a', step_id: 's', behavior_iteration: 2 },
  { action: 'update-step-focus', focus: 'Revised focus' },
  { action: 'clear_effect_current' },
  { action: 'clear_effect_history' },
  { action: 'complete_reflection' },
];
it.each(cases)('$action preserves all earlier snapshot data', async (params) => {
  const previous = setup();
  const copy = structuredClone(previous);
  const Action = getActionClass(params.action)!;
  await new Action({}).execute(params as ExecutionStep);
  expect(useWorkflowStateMachine.getState().stateJSON).not.toBe(previous);
  expect(previous).toEqual(copy);
});
it('archives output once and leaves the published history untouched', async () => {
  const previous = setup();
  const Clear = getActionClass('clear_effect_current')!;
  await new Clear({}).execute({ action: 'clear_effect_current' });
  const completed = useWorkflowStateMachine.getState();
  expect(completed.stateJSON.state.effects).toEqual({
    current: [],
    history: [
      { type: 'text', text: 'previous output' },
      { type: 'text', text: 'new output' },
    ],
  });
  expect(previous.state.effects.history).toHaveLength(1);
  await new Clear({}).execute({ action: 'clear_effect_current' });
  expect(useWorkflowStateMachine.getState()).toBe(completed);
});
it('does not create an empty agent for an invalid section', async () => {
  setup();
  const previous = useWorkflowStateMachine.getState();
  const Update = getActionClass('update_agent')!;
  await new Update({}).execute({
    action: 'update_agent',
    agent_id: 'new-agent',
    section: 'invalid',
    content: 'text',
  } as ExecutionStep);
  expect(useWorkflowStateMachine.getState()).toBe(previous);
  expect(previous.stateJSON.agents?.['new-agent']).toBeUndefined();
});
it('preserves identity when assigning an unchanged location', async () => {
  const previous = setup();
  const Update = getActionClass('update_location')!;
  await new Update({}).execute({
    action: 'update_location',
    step_id: 'clear',
    behavior_id: 'clear',
  });
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
});
it('does not resume a workflow cancelled by a debug metadata subscriber', async () => {
  setup();
  useNotebookStore.setState({
    cells: [
      { id: 'code', type: 'code', content: 'pass', metadata: { debug: { isDebugging: true } } },
    ],
  });
  const stop = useNotebookStore.subscribe((state) => {
    if (state.cells[0]?.metadata?.debug.isDebugging === false)
      useWorkflowStateMachine.getState().cancel();
  });
  try {
    const Complete = getActionClass('complete_reflection')!;
    expect(await new Complete({}).execute({ action: 'complete_reflection' })).toBe(false);
    expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.CANCELED);
  } finally {
    stop();
  }
});
