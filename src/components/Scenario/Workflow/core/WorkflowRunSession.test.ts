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
    prepare: vi.fn<(signal: AbortSignal) => Promise<typeof step>>(async () => step),
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
  expect(f.ports.fail).toHaveBeenCalledExactlyOnceWith(
    new Error('Workflow execution exceeded the step limit (2)')
  );
  expect(f.ports.busy).toHaveBeenLastCalledWith(false);
  f.ports.fail.mockClear();
  f.step.mockClear();
  f.step.mockImplementation(async (snapshot) => [snapshot, null]);
  await f.session.start(createInitialStateJSON());
  expect(f.step).toHaveBeenCalledOnce();
  expect(f.ports.fail).not.toHaveBeenCalled();
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

it.each([
  WorkflowState.COMPLETE,
  WorkflowState.FAILED,
  WorkflowState.CANCELED,
  WorkflowState.PAUSED,
])('does not report exhaustion when the final allowed step reaches %s', async (status) => {
  const f = setup(1);
  f.step.mockImplementation(async (snapshot) => {
    snapshot.state.FSM.state = status;
    return [snapshot, 'finished'];
  });
  await f.session.start(createInitialStateJSON());
  expect(f.step).toHaveBeenCalledOnce();
  expect(f.ports.fail).not.toHaveBeenCalled();
});

it('does not report exhaustion when the final publication synchronously cancels', async () => {
  const f = setup(1);
  f.step.mockImplementation(async (snapshot) => [snapshot, 'continue']);
  f.ports.publish.mockImplementationOnce(() => {}).mockImplementation(() => f.session.stop());
  await f.session.start(createInitialStateJSON());
  expect(f.step).toHaveBeenCalledOnce();
  expect(f.ports.fail).not.toHaveBeenCalled();
});

it('accepts no-transition completion at the exact limit', async () => {
  const f = setup(1);
  f.step.mockImplementation(async (snapshot) => [snapshot, null]);
  await f.session.start(createInitialStateJSON());
  expect(f.step).toHaveBeenCalledOnce();
  expect(f.ports.fail).not.toHaveBeenCalled();
});

it.each(['busy', 'abort'])(
  'keeps a newer start issued by the old %s cleanup callback',
  async (source) => {
    const f = setup();
    const ready = deferred<typeof f.step>();
    f.ports.prepare.mockReturnValue(ready.promise);
    const first = f.session.start(createInitialStateJSON());
    let latest!: Promise<void>;
    const latestState = createInitialStateJSON();
    latestState.metadata = { marker: 'latest' };
    const replace = () => {
      latest = f.session.start(latestState);
    };
    if (source === 'busy') {
      f.ports.busy.mockImplementationOnce(replace);
    } else {
      f.ports.prepare.mock.calls[0][0].addEventListener('abort', replace, { once: true });
    }
    const superseded = f.session.start(createInitialStateJSON());
    await first;
    await superseded;
    expect(f.ports.prepare).toHaveBeenCalledTimes(2);
    expect(f.ports.publish).toHaveBeenLastCalledWith(latestState);
    expect(f.ports.busy).toHaveBeenLastCalledWith(true);
    f.session.stop();
    await latest;
    expect(f.ports.prepare.mock.calls[1][0].aborted).toBe(true);
    ready.resolve(f.step);
    await Promise.resolve();
    expect(f.step).not.toHaveBeenCalled();
  }
);

it('honors a stop issued synchronously during replacement cleanup', async () => {
  const f = setup();
  const ready = deferred<typeof f.step>();
  f.ports.prepare.mockReturnValue(ready.promise);
  const first = f.session.start(createInitialStateJSON());
  f.ports.busy.mockImplementationOnce(() => f.session.stop());
  await f.session.start(createInitialStateJSON());
  await first;
  expect(f.ports.prepare).toHaveBeenCalledOnce();
  expect(f.ports.publish).toHaveBeenCalledOnce();
  expect(f.ports.busy).toHaveBeenLastCalledWith(false);
  ready.resolve(f.step);
});

it('releases a subscription that invalidates the run synchronously during registration', async () => {
  const f = setup();
  const release = vi.fn();
  vi.spyOn(f.ports, 'watch').mockImplementation((check) => {
    f.switchOwner('b');
    check();
    return release;
  });
  await f.session.start(createInitialStateJSON());
  expect(release).toHaveBeenCalledOnce();
  expect(f.ports.publish).not.toHaveBeenCalled();
  expect(f.ports.prepare).not.toHaveBeenCalled();
});

it('does not clear a newer run busy flag when unsubscribe starts it', async () => {
  const f = setup();
  const ready = deferred<typeof f.step>();
  f.ports.prepare.mockReturnValue(ready.promise);
  let next!: Promise<void>;
  const originalWatch = f.ports.watch;
  vi.spyOn(f.ports, 'watch').mockImplementationOnce((check) => {
    const release = originalWatch(check);
    return () => {
      release();
      next = f.session.start(createInitialStateJSON());
    };
  });
  const first = f.session.start(createInitialStateJSON());
  f.session.stop();
  await first;
  expect(f.ports.prepare).toHaveBeenCalledTimes(2);
  expect(f.ports.busy).toHaveBeenLastCalledWith(true);
  f.session.stop();
  await next;
  ready.resolve(f.step);
});
