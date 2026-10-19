import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { createInitialStateJSON, WorkflowState } from '@Store/models';
import { CompleteWorkflowPlanningAction } from './CompleteWorkflowPlanningAction';
import useNotebookStore from '@Store/notebookStore';
import { useAIAgentStore } from '@Store/AIAgentStore';
const mocks = vi.hoisted(() => ({ section: vi.fn() }));
vi.mock('../base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../base')>()),
  executeAction: mocks.section,
}));
const original = useWorkflowStateMachine.getState();
const originalNotebook = useNotebookStore.getState();
const originalAgent = useAIAgentStore.getState();
beforeEach(() => {
  const snapshot = createInitialStateJSON();
  snapshot.observation.location.progress.stages.planned = [
    { stage_id: 'a', title: 'Analysis', task: 'Analyze', acceptance: '', planning_complete: true },
  ];
  useWorkflowStateMachine.setState({ stateJSON: snapshot, currentState: WorkflowState.IDLE });
});
afterEach(() => {
  useWorkflowStateMachine.setState(original, true);
  useNotebookStore.setState(originalNotebook, true);
  useAIAgentStore.setState(originalAgent, true);
  vi.resetAllMocks();
});
it('waits for the heading and publishes a new snapshot only after success', async () => {
  let release!: () => void;
  mocks.section.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const previous = useWorkflowStateMachine.getState().stateJSON;
  const pending = new CompleteWorkflowPlanningAction({}).execute({
    action: 'complete_workflow_planning',
  });
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
  expect(previous.state.FSM.state).toBe(WorkflowState.IDLE);
  release();
  await pending;
  expect(useWorkflowStateMachine.getState().stateJSON).not.toBe(previous);
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.STAGE_RUNNING);
  expect(previous.state.FSM.state).toBe(WorkflowState.IDLE);
});
it('propagates heading failure without modifying the published snapshot', async () => {
  const failure = new Error('Cannot insert heading');
  mocks.section.mockRejectedValue(failure);
  const previous = useWorkflowStateMachine.getState().stateJSON;
  const copy = structuredClone(previous);
  await expect(
    new CompleteWorkflowPlanningAction({}).execute({ action: 'complete_workflow_planning' })
  ).rejects.toBe(failure);
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
  expect(previous).toEqual(copy);
});
it('forwards cancellation and does not publish a cancelled planning result', async () => {
  const abort = new AbortController();
  let release!: () => void;
  mocks.section.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const previous = useWorkflowStateMachine.getState().stateJSON;
  const pending = new CompleteWorkflowPlanningAction({}).execute(
    { action: 'complete_workflow_planning' },
    abort.signal
  );
  expect(mocks.section).toHaveBeenCalledExactlyOnceWith('new_section', 'Analysis', abort.signal);
  abort.abort();
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
});
it('does not overwrite a newer workflow snapshot when heading insertion drains', async () => {
  let release!: () => void;
  mocks.section.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const pending = new CompleteWorkflowPlanningAction({}).execute({
    action: 'complete_workflow_planning',
  });
  useWorkflowStateMachine.getState().cancel();
  const cancelled = useWorkflowStateMachine.getState().stateJSON;
  release();
  await pending;
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(cancelled);
});

it('inserts the first stage heading through the real shared executor before publishing planning', async () => {
  const { executeAction } = await vi.importActual<typeof import('../base')>('../base');
  mocks.section.mockImplementation(executeAction);
  useNotebookStore.setState({
    notebookId: 'a',
    cells: [{ id: 'title', type: 'markdown', content: '# Notebook' }],
  });
  await new CompleteWorkflowPlanningAction({}).execute({ action: 'complete_workflow_planning' });
  expect(
    useNotebookStore.getState().cells.filter((cell) => cell.content === '## Analysis')
  ).toHaveLength(1);
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.STAGE_RUNNING);
  expect(useWorkflowStateMachine.getState().stateJSON.observation.location.current.stage_id).toBe(
    'a'
  );
});
