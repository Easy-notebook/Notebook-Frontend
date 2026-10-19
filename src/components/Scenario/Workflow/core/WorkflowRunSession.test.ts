import { expect, it, vi } from 'vitest';
import { createInitialStateJSON, WorkflowState, type StateJSON } from '@Store/models';
import { WorkflowRunSession } from './WorkflowRunSession';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(limit = 5) {
  let owner = 'a';
  const listeners = new Set<() => void>();
  const step =
    vi.fn<(state: StateJSON, signal: AbortSignal) => Promise<[StateJSON, string | null]>>();
  const ports = {
    notebookId: () => owner,
    watch: (check: () => void) => {
      listeners.add(check);
      return () => {
        listeners.delete(check);
      };
    },
    prepare: vi.fn(async () => step),
    publish: vi.fn(),
    busy: vi.fn(),
    fail: vi.fn(),
    limit,
  };
  return {
    session: new WorkflowRunSession(ports),
    ports,
    step,
    switchOwner: (id: string) => {
      owner = id;
      listeners.forEach((check) => check());
    },
  };
}
it('publishes each step and releases running state at a terminal result', async () => {
  const f = setup();
  const input = createInitialStateJSON();
  f.step.mockImplementation(async (snapshot) => {
    snapshot.state.FSM.state = WorkflowState.COMPLETE;
    return [snapshot, 'done'];
  });
  await f.session.start(input);
  expect(f.step).toHaveBeenCalledOnce();
  expect(f.ports.publish).toHaveBeenCalledTimes(2);
  expect(input.state.FSM.state).toBe(WorkflowState.IDLE);
  expect(f.ports.busy.mock.calls).toEqual([[true], [false]]);
});
it('settles cancellation during preparation without waiting for ignored cancellation', async () => {
  const f = setup();
  const ready = deferred<typeof f.step>();
  f.ports.prepare.mockReturnValue(ready.promise);
  const pending = f.session.start(createInitialStateJSON());
  f.session.stop();
  await pending;
  ready.resolve(f.step);
  await Promise.resolve();
  expect(f.step).not.toHaveBeenCalled();
});
it('ignores old completion and busy cleanup after a new run starts', async () => {
  const f = setup();
  const old = deferred<[StateJSON, string | null]>();
  const next = deferred<[StateJSON, string | null]>();
  f.step.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const first = f.session.start(createInitialStateJSON());
  await vi.waitFor(() => expect(f.step).toHaveBeenCalledTimes(1));
  const second = f.session.start(createInitialStateJSON());
  await first;
  await vi.waitFor(() => expect(f.step).toHaveBeenCalledTimes(2));
  const publications = f.ports.publish.mock.calls.length;
  old.resolve([createInitialStateJSON(), 'old']);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.ports.publish).toHaveBeenCalledTimes(publications);
  expect(f.ports.busy).toHaveBeenLastCalledWith(true);
  f.session.stop();
  await second;
  next.resolve([createInitialStateJSON(), null]);
});
it('invalidates away-and-back navigation and suppresses late errors', async () => {
  const f = setup();
  const result = deferred<[StateJSON, string | null]>();
  f.step.mockReturnValue(result.promise);
  const pending = f.session.start(createInitialStateJSON());
  await vi.waitFor(() => expect(f.step).toHaveBeenCalledOnce());
  f.switchOwner('b');
  f.switchOwner('a');
  await pending;
  expect(f.step.mock.calls[0][1].aborted).toBe(true);
  result.reject(new Error('late'));
  await Promise.resolve();
  await Promise.resolve();
  expect(f.ports.fail).not.toHaveBeenCalled();
  expect(f.ports.publish).toHaveBeenCalledOnce();
});
it('stops after no transition and observes a bounded iteration count', async () => {
  const f = setup(2);
  f.step.mockImplementation(async (snapshot) => [snapshot, 'continue']);
  await f.session.start(createInitialStateJSON());
  expect(f.step).toHaveBeenCalledTimes(2);
  f.step.mockClear();
  f.step.mockImplementation(async (snapshot) => [snapshot, null]);
  await f.session.start(createInitialStateJSON());
  expect(f.step).toHaveBeenCalledOnce();
});
it('handles preparation failures and always releases busy state', async () => {
  const f = setup();
  const error = new Error('initialization failed');
  f.ports.prepare.mockRejectedValue(error);
  await f.session.start(createInitialStateJSON());
  expect(f.ports.fail).toHaveBeenCalledWith(error);
  expect(f.ports.busy).toHaveBeenLastCalledWith(false);
});
it('honors synchronous cancellation during publication before starting effects', async () => {
  const f = setup();
  f.ports.publish.mockImplementation(() => f.session.stop());
  await f.session.start(createInitialStateJSON());
  expect(f.ports.prepare).not.toHaveBeenCalled();
  expect(f.step).not.toHaveBeenCalled();
});
