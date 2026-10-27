import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON, WorkflowState, type ExecutionStep } from '@Store/models';
import { AsyncStateMachineAdapter } from './AsyncStateMachineAdapter';
import { StateFactory } from '../states/StateFactory';
import { getTransitionCoordinator } from '../transitions/TransitionCoordinator';
import { useWorkflowStateMachine } from '../store/workflowStateMachine';
import { getActionClass } from '../actions';

const original = useWorkflowStateMachine.getState();
afterEach(() => {
  vi.restoreAllMocks();
  useWorkflowStateMachine.setState(original, true);
  getTransitionCoordinator().setContext({ scriptStore: undefined });
});

it.each([false, true])(
  'applies streamed stage context through the action registry (wrapped=%s)',
  async (wrapped) => {
    const state = createInitialStateJSON();
    state.state.FSM.state = WorkflowState.STAGE_RUNNING;
    state.observation.location.current.stage_id = 'current';
    state.observation.location.progress.stages.planned = [
      {
        stage_id: 'current',
        title: 'Current',
        task: 'Work',
        acceptance: 'Done',
        planning_complete: false,
      },
      {
        stage_id: 'other',
        title: 'Other',
        task: 'Work',
        acceptance: 'Done',
        planning_complete: false,
      },
    ];
    const before = structuredClone(state);
    useWorkflowStateMachine.setState({
      stateJSON: state,
      currentState: WorkflowState.STAGE_RUNNING,
    });
    async function* actions() {
      const action = {
        type: 'update_stage_context',
        stage_id: 'current',
        focus: 'Quality',
        notes: 'Check missing values',
      };
      yield wrapped ? { action } : action;
    }
    vi.spyOn(StateFactory.getState('STAGE_RUNNING')!, 'callAPI').mockResolvedValue(actions());
    vi.spyOn(getTransitionCoordinator(), 'applyTransition').mockImplementation(async (current) => ({
      state: current,
      transitionName: 'context_updated',
    }));
    const execAction = vi.fn(async (step: ExecutionStep) => {
      const Action = getActionClass(step.action)!;
      await new Action({}).execute(step);
    });
    const adapter = new AsyncStateMachineAdapter(undefined, { execAction });
    const [updated] = await adapter.step(state);
    expect(execAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_stage_context',
        stage_id: 'current',
      }),
      undefined
    );
    expect(updated.observation.location.progress.stages.planned?.[0]).toMatchObject({
      stage_id: 'current',
      focus: 'Quality',
      notes: 'Check missing values',
    });
    expect(updated.observation.location.progress.stages.planned?.[1]).toEqual(
      before.observation.location.progress.stages.planned?.[1]
    );
    expect(state).toEqual(before);
  }
);

it('awaits each streamed planning action before reading the next and applying the transition', async () => {
  const state = createInitialStateJSON();
  useWorkflowStateMachine.setState({ stateJSON: state, currentState: WorkflowState.IDLE });
  const read: string[] = [];
  const completed: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const client = {
    async *callPlanningAPI() {
      read.push('plan_stage');
      yield {
        action: {
          type: 'plan_stage',
          stage_id: 'a',
          title: 'Analysis',
          task: 'Inspect',
          acceptance: 'Done',
        },
      };
      read.push('update_stage_context');
      yield { action: { type: 'update_stage_context', stage_id: 'a', focus: 'Quality' } };
    },
    callGeneratingAPI: vi.fn(),
    callReflectingAPI: vi.fn(),
  };
  const transition = vi
    .spyOn(getTransitionCoordinator(), 'applyTransition')
    .mockImplementation(async (current) => {
      expect(completed).toEqual(['plan_stage', 'update_stage_context']);
      return { state: current, transitionName: 'planning_applied' };
    });
  const execAction = vi.fn(async (step: ExecutionStep) => {
    if (step.action === 'plan_stage') {
      entered();
      await gate;
    }
    const Action = getActionClass(step.action);
    if (!Action) throw new Error(`Unregistered action: ${step.action}`);
    await new Action({}).execute(step);
    completed.push(step.action);
  });
  const pending = new AsyncStateMachineAdapter(client, { execAction }).step(state);
  try {
    await firstEntered;
    expect(read).toEqual(['plan_stage']);
    expect(completed).toEqual([]);
    expect(transition).not.toHaveBeenCalled();
  } finally {
    release();
  }
  const [updated] = await pending;
  expect(execAction).toHaveBeenCalledTimes(2);
  expect(updated.observation.location.progress.stages.planned).toEqual([
    expect.objectContaining({ stage_id: 'a', title: 'Analysis', focus: 'Quality' }),
  ]);
  expect(transition).toHaveBeenCalledOnce();
});
