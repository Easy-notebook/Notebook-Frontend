import { expect, it, vi } from 'vitest';
import { CommandDraft } from './CommandDraft';
import { SubmissionActivity } from './SubmissionActivity';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(activity = new SubmissionActivity(vi.fn())) {
  const draft = new CommandDraft(activity);
  draft.attach();
  draft.setValue(' original ');
  return draft;
}
it('clears unchanged input only after acceptance', async () => {
  const draft = setup();
  const operation = deferred<boolean>();
  const execute = vi.fn(() => operation.promise);
  const run = draft.submit(execute, vi.fn());
  expect(execute).toHaveBeenCalledWith('original');
  expect(draft.getSnapshot()).toEqual({ value: ' original ', pending: true });
  operation.resolve(true);
  await run;
  expect(draft.getSnapshot()).toEqual({ value: '', pending: false });
});
it.each(['rejected', 'throw'] as const)(
  'retains input when submission is %s and permits retry',
  async (mode) => {
    const draft = setup();
    const error = vi.fn();
    await draft.submit(async () => {
      if (mode === 'throw') throw new Error('failed');
      return false;
    }, error);
    expect(draft.getSnapshot()).toEqual({ value: ' original ', pending: false });
    expect(error).toHaveBeenCalledTimes(mode === 'throw' ? 1 : 0);
    await draft.submit(async () => true, error);
    expect(draft.getSnapshot().value).toBe('');
  }
);
it('preserves edits made during submission, including editing away and back to the same text', async () => {
  const draft = setup();
  const operation = deferred<boolean>();
  const run = draft.submit(() => operation.promise, vi.fn());
  draft.setValue('new');
  draft.setValue(' original ');
  operation.resolve(true);
  await run;
  expect(draft.getSnapshot().value).toBe(' original ');
});
it('suppresses duplicate submit events while allowing text editing', async () => {
  const draft = setup();
  const operation = deferred<boolean>();
  const execute = vi.fn(() => operation.promise);
  const first = draft.submit(execute, vi.fn());
  draft.setValue('next');
  await draft.submit(execute, vi.fn());
  expect(execute).toHaveBeenCalledOnce();
  operation.resolve(true);
  await first;
  expect(draft.getSnapshot().value).toBe('next');
});
it('does not clear a new notebook draft or settle its pending flag from an old completion', async () => {
  const draft = setup();
  const old = deferred<boolean>();
  const current = deferred<boolean>();
  const first = draft.submit(() => old.promise, vi.fn());
  draft.reset();
  draft.setValue('new notebook');
  const second = draft.submit(() => current.promise, vi.fn());
  old.resolve(true);
  await first;
  expect(draft.getSnapshot()).toEqual({ value: 'new notebook', pending: true });
  current.resolve(true);
  await second;
  expect(draft.getSnapshot().pending).toBe(false);
});
it('releases activity after unmount without notifying or reporting obsolete failures', async () => {
  const loading = vi.fn();
  const draft = setup(new SubmissionActivity(loading));
  const operation = deferred<boolean>();
  const error = vi.fn();
  const run = draft.submit(() => operation.promise, error);
  draft.detach();
  const notify = vi.fn();
  draft.subscribe(notify);
  operation.reject(new Error('late'));
  await run;
  expect(loading.mock.calls).toEqual([[true], [false]]);
  expect(notify).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
it('keeps global activity true until submissions from both inputs settle', async () => {
  const loading = vi.fn();
  const activity = new SubmissionActivity(loading);
  const one = setup(activity);
  const two = setup(activity);
  const a = deferred<boolean>();
  const b = deferred<boolean>();
  const first = one.submit(() => a.promise, vi.fn());
  const second = two.submit(() => b.promise, vi.fn());
  a.resolve(true);
  await first;
  expect(loading.mock.calls).toEqual([[true]]);
  b.resolve(false);
  await second;
  expect(loading.mock.calls).toEqual([[true], [false]]);
});
it('does not execute when a subscriber resets the draft during admission', async () => {
  const draft = setup();
  const execute = vi.fn();
  draft.subscribe(() => {
    if (draft.getSnapshot().pending) draft.reset();
  });
  await draft.submit(execute, vi.fn());
  expect(execute).not.toHaveBeenCalled();
});
it('does not admit empty input or work after detach', async () => {
  const draft = setup();
  const execute = vi.fn();
  draft.setValue('  ');
  await draft.submit(execute, vi.fn());
  draft.detach();
  draft.setValue('late');
  await draft.submit(execute, vi.fn());
  expect(execute).not.toHaveBeenCalled();
});
it('makes activity release idempotent so old cleanup cannot release another submission', () => {
  const loading = vi.fn();
  const activity = new SubmissionActivity(loading);
  const a = activity.begin();
  const b = activity.begin();
  a();
  a();
  expect(loading.mock.calls).toEqual([[true]]);
  b();
  b();
  expect(loading.mock.calls).toEqual([[true], [false]]);
});
