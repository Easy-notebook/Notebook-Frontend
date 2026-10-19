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
