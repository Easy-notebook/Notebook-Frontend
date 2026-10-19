import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON, WorkflowState, type StateJSON } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';
import { useWorkflowStateMachine } from './workflowStateMachine';
const mocks = vi.hoisted(() => ({ step: vi.fn(), navigate: vi.fn() }));
vi.mock('../core/AsyncStateMachineAdapter', () => ({
  getAsyncStateMachine: async () => ({ step: mocks.step }),
}));
vi.mock('@Store/routeStore', () => ({
  default: { getState: () => ({ currentView: 'workspace', navigateToWorkspace: mocks.navigate }) },
}));
const originalNotebook = useNotebookStore.getState();
afterEach(() => {
  useWorkflowStateMachine.getState().reset();
  useNotebookStore.setState(originalNotebook, true);
  vi.resetAllMocks();
});
function setup() {
  useWorkflowStateMachine.getState().reset();
  useNotebookStore.setState({ notebookId: 'a', isExecuting: false });
}
function deferred() {
  let resolve!: (value: [StateJSON, string | null]) => void;
  const promise = new Promise<[StateJSON, string | null]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('cancels a pending run without letting its eventual result overwrite CANCELED', async () => {
  setup();
  const response = deferred();
  mocks.step.mockReturnValue(response.promise);
  const pending = useWorkflowStateMachine.getState().startWorkflow('planning');
  await vi.waitFor(() => expect(mocks.step).toHaveBeenCalledOnce());
  expect(useNotebookStore.getState().isExecuting).toBe(true);
  useWorkflowStateMachine.getState().cancel();
  await pending;
  expect(useNotebookStore.getState().isExecuting).toBe(false);
  response.resolve([createInitialStateJSON(), 'old']);
  await Promise.resolve();
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.CANCELED);
});
it('pause stops the old run and resume starts a fresh run from the paused state', async () => {
  setup();
  const first = deferred();
  const resumed = deferred();
  mocks.step.mockReturnValueOnce(first.promise).mockReturnValueOnce(resumed.promise);
  const pending = useWorkflowStateMachine.getState().startWorkflow('planning');
  await vi.waitFor(() => expect(mocks.step).toHaveBeenCalledTimes(1));
  useWorkflowStateMachine.getState().pause();
  await pending;
  expect(mocks.step.mock.calls[0][1].aborted).toBe(true);
  useWorkflowStateMachine.getState().resume();
  await vi.waitFor(() => expect(mocks.step).toHaveBeenCalledTimes(2));
  first.resolve([createInitialStateJSON(), 'late']);
  await Promise.resolve();
  await Promise.resolve();
  expect(useNotebookStore.getState().isExecuting).toBe(true);
  const complete = createInitialStateJSON();
  complete.state.FSM.state = WorkflowState.COMPLETE;
  resumed.resolve([complete, 'done']);
  await vi.waitFor(() => expect(useNotebookStore.getState().isExecuting).toBe(false));
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.COMPLETE);
});
it('starts a new planning run after a previous terminal state', async () => {
  setup();
  const complete = createInitialStateJSON();
  complete.state.FSM.state = WorkflowState.COMPLETE;
  useWorkflowStateMachine.getState().setState(complete);
  mocks.step.mockResolvedValue([complete, 'done']);
  await useWorkflowStateMachine.getState().startWorkflow({ user_requirement: 'new request' });
  expect(mocks.step).toHaveBeenCalledOnce();
  expect(mocks.step.mock.calls[0][0].state.FSM.state).toBe(WorkflowState.IDLE);
  expect(mocks.step.mock.calls[0][0].state.variables.user_requirement).toBe('new request');
});
