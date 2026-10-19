import { expect, it, vi } from 'vitest';
import { TransitionCoordinator } from './TransitionCoordinator';
import { WorkflowState } from '../observation/WorkflowState';
import { WorkflowState as Status } from '@Store/models';

const response = (title = 'Notebook') => ({
  title,
  description: 'Introduction',
  stages: [{ stage_id: 'a', title: 'Analysis' }],
});
it('rejects pre-cancelled transitions before dispatching notebook actions', async () => {
  const abort = new AbortController();
  abort.abort();
  const execAction = vi.fn();
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  await expect(
    coordinator.applyTransition(WorkflowState.create(), response(), undefined, true, abort.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(execAction).not.toHaveBeenCalled();
});
it('stops initialization after cancellation while the title action is pending', async () => {
  let release!: () => void;
  const execAction = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  const abort = new AbortController();
  const state = WorkflowState.create();
  const before = state.toJSON();
  const pending = coordinator.applyTransition(state, response(), undefined, true, abort.signal);
  const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(execAction).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'update_title' }),
    abort.signal
  );
  abort.abort();
  release();
  await rejection;
  expect(execAction).toHaveBeenCalledOnce();
  expect(state.toJSON()).toEqual(before);
});
it('keeps cancellation local to each invocation of a shared handler', async () => {
  let release!: () => void;
  const first = new AbortController();
  const second = new AbortController();
  const execAction = vi.fn(async (_step, signal) => {
    if (signal === first.signal)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  const old = coordinator.applyTransition(
    WorkflowState.create(),
    response('old'),
    undefined,
    false,
    first.signal
  );
  const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  const current = await coordinator.applyTransition(
    WorkflowState.create(),
    response('new'),
    undefined,
    false,
    second.signal
  );
  first.abort();
  release();
  await rejection;
  expect(current.state.state.FSM.state).toBe(Status.STAGE_RUNNING);
  expect(execAction.mock.calls.filter(([, signal]) => signal === second.signal)).toHaveLength(3);
  expect(execAction.mock.calls.filter(([, signal]) => signal === first.signal)).toHaveLength(1);
});
it('forwards cancellation to auto-triggered next-step actions', async () => {
  const abort = new AbortController();
  const execAction = vi.fn(async () => {
    abort.abort();
  });
  const coordinator = new TransitionCoordinator({ scriptStore: { execAction } });
  const state = WorkflowState.create();
  state.state.FSM.setState(Status.STEP_COMPLETED);
  state.location.progress.setPlannedSteps([
    { step_id: 'next', title: 'Next step', task: '', acceptance: '', planning_complete: true },
  ]);
  await expect(coordinator.autoTriggerNextTransition(state, abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(execAction).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ action: 'new_step' }),
    abort.signal
  );
});
