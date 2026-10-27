import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON, WorkflowEvent, WorkflowState } from '@Store/models';
import { useWorkflowStateMachine } from './workflowStateMachine';
import useNotebookStore from '@Store/notebookStore';

import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
import { WorkflowState as WorkflowStateModel } from '../observation/WorkflowState';

const initial = useWorkflowStateMachine.getState();
const initialNotebook = useNotebookStore.getState();
const coordinatorContext = getTransitionCoordinator().getContext();
afterEach(() => {
  useWorkflowStateMachine.getState().reset();
  vi.restoreAllMocks();
  useWorkflowStateMachine.setState(initial, true);
  useNotebookStore.setState(initialNotebook, true);
  getTransitionCoordinator().setContext({
    scriptStore: undefined,
    apiClient: undefined,
    notebookStore: undefined,
    aiContextStore: undefined,
    ...coordinatorContext,
  });
});

it.each(['transition', 'api'] as const)(
  'uses domain transitions and stores plain snapshots through %s',
  async (entry) => {
    const snapshot = createInitialStateJSON();
    snapshot.state.FSM.state = WorkflowState.STAGE_COMPLETED;
    snapshot.metadata = { marker: 'preserved' };
    const original = structuredClone(snapshot);
    useWorkflowStateMachine.setState({
      currentState: WorkflowState.STAGE_COMPLETED,
      stateJSON: snapshot,
      transitionHistory: [],
    });
    if (entry === 'transition') {
      await useWorkflowStateMachine
        .getState()
        .transition(WorkflowEvent.COMPLETE_WORKFLOW, { _auto_trigger: 'COMPLETE_WORKFLOW' });
    } else {
      await useWorkflowStateMachine
        .getState()
        .handleAPIResponse({ _auto_trigger: 'COMPLETE_WORKFLOW' }, 'completion');
    }
    const current = useWorkflowStateMachine.getState();
    expect(current.currentState).toBe(WorkflowState.COMPLETE);
    expect(current.stateJSON.state.FSM.state).toBe(WorkflowState.COMPLETE);
    expect(current.stateJSON.state.FSM.last_transition).toBe(WorkflowEvent.COMPLETE_WORKFLOW);
    expect(current.stateJSON.metadata).toEqual({ marker: 'preserved' });
    expect(snapshot).toEqual(original);
    expect(structuredClone(current.stateJSON)).toEqual(current.stateJSON);
    expect(Object.getPrototypeOf(current.stateJSON)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(current.stateJSON.state.FSM)).toBe(Object.prototype);
    if (entry === 'transition') {
      expect(current.transitionHistory).toHaveLength(1);
      expect(current.transitionHistory[0]).toMatchObject({
        from: WorkflowState.STAGE_COMPLETED,
        to: WorkflowState.COMPLETE,
        event: WorkflowEvent.COMPLETE_WORKFLOW,
      });
    }
  }
);

it.each(['pause', 'cancel', 'fail'] as const)(
  '%s publishes a fresh snapshot without mutating the old one',
  (control) => {
    const snapshot = createInitialStateJSON();
    snapshot.state.FSM.state = WorkflowState.STEP_RUNNING;
    const original = structuredClone(snapshot);
    useWorkflowStateMachine.setState({
      stateJSON: snapshot,
      currentState: WorkflowState.STEP_RUNNING,
    });
    if (control === 'fail') useWorkflowStateMachine.getState().fail('failure');
    else useWorkflowStateMachine.getState()[control]();
    expect(snapshot).toEqual(original);
    expect(useWorkflowStateMachine.getState().stateJSON).not.toBe(snapshot);
  }
);

it('repeated pause retains the resume target and resume preserves the paused snapshot', () => {
  const snapshot = createInitialStateJSON();
  snapshot.state.FSM.state = WorkflowState.STEP_RUNNING;
  useWorkflowStateMachine.setState({
    stateJSON: snapshot,
    currentState: WorkflowState.STEP_RUNNING,
  });
  useWorkflowStateMachine.getState().pause();
  const paused = useWorkflowStateMachine.getState().stateJSON;
  useWorkflowStateMachine.getState().pause();
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(paused);
  useWorkflowStateMachine.getState().resume();
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.STEP_RUNNING);
  expect(paused.state.FSM.state).toBe(WorkflowState.PAUSED);
  expect(paused.state.FSM.previous_state).toBe(WorkflowState.STEP_RUNNING);
});

it.each(['transition', 'api'] as const)(
  'ignores late %s completion after cancellation',
  async (entry) => {
    const snapshot = createInitialStateJSON();
    useWorkflowStateMachine.setState({
      stateJSON: snapshot,
      currentState: WorkflowState.IDLE,
      transitionHistory: [],
    });
    let complete!: (result: { state: WorkflowStateModel; transitionName: string }) => void;
    vi.spyOn(getTransitionCoordinator(), 'applyTransition').mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const pending =
      entry === 'transition'
        ? useWorkflowStateMachine.getState().transition(WorkflowEvent.COMPLETE_WORKFLOW, {})
        : useWorkflowStateMachine.getState().handleAPIResponse({});
    useWorkflowStateMachine.getState().cancel();
    const cancelled = useWorkflowStateMachine.getState().stateJSON;
    complete({ state: new WorkflowStateModel(snapshot), transitionName: 'late' });
    await pending;
    expect(useWorkflowStateMachine.getState().stateJSON).toBe(cancelled);
    expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.CANCELED);
    expect(useWorkflowStateMachine.getState().transitionHistory).toEqual([]);
  }
);

it.each(['transition', 'api'] as const)('ignores late %s failure after reset', async (entry) => {
  let reject!: (error: Error) => void;
  vi.spyOn(getTransitionCoordinator(), 'applyTransition').mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    })
  );
  const pending =
    entry === 'transition'
      ? useWorkflowStateMachine.getState().transition(WorkflowEvent.COMPLETE_WORKFLOW, {})
      : useWorkflowStateMachine.getState().handleAPIResponse({});
  useWorkflowStateMachine.getState().reset();
  const reset = useWorkflowStateMachine.getState().stateJSON;
  reject(new Error('obsolete failure'));
  await pending;
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(reset);
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.IDLE);
});

it.each(['transition', 'api'] as const)(
  '%s cancellation stops the next action of a real handler',
  async (entry) => {
    let release!: () => void;
    const execAction = vi.fn<(_step: unknown, signal?: AbortSignal) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    getTransitionCoordinator().setContext({ scriptStore: { execAction } });
    const response = {
      title: 'Notebook',
      description: 'Intro',
      stages: [{ stage_id: 'a', title: 'Analysis' }],
    };
    const pending =
      entry === 'transition'
        ? useWorkflowStateMachine.getState().transition(WorkflowEvent.START_WORKFLOW, response)
        : useWorkflowStateMachine.getState().handleAPIResponse(response);
    expect(execAction).toHaveBeenCalledOnce();
    const signal = execAction.mock.calls[0][1] as AbortSignal;
    useWorkflowStateMachine.getState().cancel();
    expect(signal.aborted).toBe(true);
    release();
    await pending;
    expect(execAction).toHaveBeenCalledOnce();
    expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.CANCELED);
  }
);

it.each(['transition', 'api'] as const)(
  '%s ignores completion after away-and-back notebook navigation',
  async (entry) => {
    useNotebookStore.setState({ notebookId: 'a' });
    let complete!: (result: { state: WorkflowStateModel; transitionName: string }) => void;
    const apply = vi.spyOn(getTransitionCoordinator(), 'applyTransition').mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const before = useWorkflowStateMachine.getState().stateJSON;
    const pending =
      entry === 'transition'
        ? useWorkflowStateMachine.getState().transition(WorkflowEvent.COMPLETE_WORKFLOW, {})
        : useWorkflowStateMachine.getState().handleAPIResponse({});
    const signal = apply.mock.calls[0][4]!;
    useNotebookStore.setState({ notebookId: 'b' });
    useNotebookStore.setState({ notebookId: 'a' });
    expect(signal.aborted).toBe(true);
    const next = WorkflowStateModel.create();
    next.state.FSM.setState(WorkflowState.COMPLETE);
    complete({ state: next, transitionName: 'late' });
    await pending;
    expect(useWorkflowStateMachine.getState().stateJSON).toBe(before);
  }
);

it('does not cancel a successful transition when publishing its own snapshot', async () => {
  const apply = vi.spyOn(getTransitionCoordinator(), 'applyTransition');
  await useWorkflowStateMachine
    .getState()
    .handleAPIResponse({ _auto_trigger: 'COMPLETE_WORKFLOW' });
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.COMPLETE);
  expect(apply.mock.calls[0][4]?.aborted).toBe(false);
});
it('still reports an owned transition failure', async () => {
  vi.spyOn(getTransitionCoordinator(), 'applyTransition').mockRejectedValue(
    new Error('owned failure')
  );
  await useWorkflowStateMachine.getState().handleAPIResponse({});
  expect(useWorkflowStateMachine.getState().currentState).toBe(WorkflowState.FAILED);
  expect(useWorkflowStateMachine.getState().stateJSON.metadata?.error).toBe('owned failure');
});
