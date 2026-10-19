import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON, WorkflowEvent, WorkflowState } from '@Store/models';
import { useWorkflowStateMachine } from './workflowStateMachine';

import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
import { WorkflowState as WorkflowStateModel } from '../observation/WorkflowState';

const initial = useWorkflowStateMachine.getState();
afterEach(() => {
  useWorkflowStateMachine.getState().reset();
  vi.restoreAllMocks();
  useWorkflowStateMachine.setState(initial, true);
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
