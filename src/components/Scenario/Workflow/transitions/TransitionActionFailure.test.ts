import { expect, it, vi } from 'vitest';
import { TransitionCoordinator } from './TransitionCoordinator';
import { WorkflowState } from '../observation/WorkflowState';
import { WorkflowState as Status } from '@Store/models';

it('rejects a step transition when its notebook action fails without mutating the input', async () => {
  const failure = new Error('cannot insert step heading');
  const execAction = vi.fn().mockRejectedValue(failure);
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  const state = WorkflowState.create();
  state.state.FSM.setState(Status.STAGE_RUNNING);
  const before = state.toJSON();
  await expect(
    coordinator.applyTransition(
      state,
      { steps: [{ step_id: 'step-a', title: 'Analyze' }] },
      undefined,
      false
    )
  ).rejects.toBe(failure);
  expect(execAction).toHaveBeenCalledOnce();
  expect(execAction.mock.calls[0][0]).toMatchObject({ action: 'new_step', content: 'Analyze' });
  expect(state.toJSON()).toEqual(before);
});

it('does not execute subsequent initialization actions after the first failure', async () => {
  const failure = new Error('cannot update notebook title');
  const execAction = vi.fn().mockRejectedValue(failure);
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  await expect(
    coordinator.applyTransition(
      WorkflowState.create(),
      {
        title: 'Notebook',
        description: 'Introduction',
        stages: [{ stage_id: 'stage-a', title: 'Analysis' }],
      },
      undefined,
      false
    )
  ).rejects.toBe(failure);
  expect(execAction).toHaveBeenCalledOnce();
  expect(execAction.mock.calls[0][0].action).toBe('update_title');
});

it('keeps successful step transitions and dispatches their action once', async () => {
  const execAction = vi.fn().mockResolvedValue(undefined);
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  const state = WorkflowState.create();
  state.state.FSM.setState(Status.STAGE_RUNNING);
  const result = await coordinator.applyTransition(
    state,
    { steps: [{ step_id: 'step-a', title: 'Analyze' }] },
    undefined,
    false
  );
  expect(result.state.state.FSM.state).toBe(Status.STEP_RUNNING);
  expect(execAction).toHaveBeenCalledOnce();
});
