import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  EmptyStatePreparationSession,
  type PreparationEffects,
} from './EmptyStatePreparationSession';
const questions = [{ problem_name: 'Summary', problem_description: 'Summarize' }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const session = new EmptyStatePreparationSession();
  session.attach();
  const effects = {
    upload: vi.fn().mockResolvedValue([]),
    accept: vi.fn(),
    prepare: vi.fn().mockResolvedValue({ columns: ['a'], info: 'data' }),
    suggest: vi.fn().mockResolvedValue(questions),
    questions: vi.fn(),
    defaultQuestion: vi.fn(),
    navigate: vi.fn(),
    loading: vi.fn(),
    error: vi.fn(),
  } satisfies PreparationEffects;
  return { session, effects };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('generates questions after completed preparation and navigates once', async () => {
  const { session, effects } = setup();
  const file = new File([], 'data.csv');
  const run = session.run([file], effects);
  await vi.advanceTimersByTimeAsync(0);
  expect(effects.prepare).toHaveBeenCalledWith(file);
  expect(effects.suggest).toHaveBeenCalledExactlyOnceWith(['a'], 'data');
  expect(effects.questions).toHaveBeenCalledWith(questions);
  expect(effects.navigate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(500);
  await run;
  expect(effects.navigate).toHaveBeenCalledOnce();
  expect(effects.loading.mock.calls).toEqual([[true], [false]]);
});
it('uses the default question for a non-tabular file without requesting suggestions', async () => {
  const { session, effects } = setup();
  const run = session.run([new File([], 'report.pdf')], effects);
  await vi.runAllTimersAsync();
  await run;
  expect(effects.defaultQuestion).toHaveBeenCalledOnce();
  expect(effects.suggest).not.toHaveBeenCalled();
  expect(effects.navigate).toHaveBeenCalledOnce();
});
it('suppresses a late question response after a newer upload starts', async () => {
  const { session, effects } = setup();
  const pending = deferred<unknown>();
  effects.suggest.mockReturnValue(pending.promise);
  const first = session.run([new File([], 'a.csv')], effects);
  await vi.advanceTimersByTimeAsync(0);
  const next = setup().effects;
  const second = session.run([new File([], 'b.pdf')], next);
  pending.resolve(questions);
  await vi.runAllTimersAsync();
  await Promise.all([first, second]);
  expect(effects.questions).not.toHaveBeenCalled();
  expect(effects.navigate).not.toHaveBeenCalled();
  expect(next.navigate).toHaveBeenCalledOnce();
});
it.each(['cancel', 'detach'] as const)(
  '%s clears the navigation timer and settles the task',
  async (action) => {
    const { session, effects } = setup();
    const run = session.run([new File([], 'a.pdf')], effects);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    session[action]();
    expect(vi.getTimerCount()).toBe(0);
    await run;
    await vi.runAllTimersAsync();
    expect(effects.navigate).not.toHaveBeenCalled();
  }
);
it('disposes URLs returned after unmount without accepting files or starting analysis', async () => {
  const { session, effects } = setup();
  const pending = deferred<unknown>();
  effects.upload.mockReturnValue(pending.promise);
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static revokeObjectURL = revoke;
    }
  );
  const run = session.run([new File([], 'a.csv')], effects);
  session.detach();
  pending.resolve([{ url: 'blob:late' }]);
  await run;
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:late');
  expect(effects.accept).not.toHaveBeenCalled();
  expect(effects.prepare).not.toHaveBeenCalled();
  expect(effects.loading.mock.calls).toEqual([[true]]);
});
it('does not generate suggestions when preparation completes after cancellation', async () => {
  const { session, effects } = setup();
  const pending = deferred<unknown>();
  effects.prepare.mockReturnValue(pending.promise);
  const run = session.run([new File([], 'a.csv')], effects);
  await vi.advanceTimersByTimeAsync(0);
  session.cancel();
  pending.resolve({ columns: ['a'], info: 'old' });
  await run;
  expect(effects.suggest).not.toHaveBeenCalled();
  expect(effects.navigate).not.toHaveBeenCalled();
});
it('rejects malformed responses without publishing questions or navigating', async () => {
  const { session, effects } = setup();
  effects.suggest.mockResolvedValue({ invalid: true });
  await session.run([new File([], 'a.csv')], effects);
  expect(effects.error).toHaveBeenCalledWith(expect.any(Error), 'suggestion');
  expect(effects.questions).not.toHaveBeenCalled();
  expect(effects.navigate).not.toHaveBeenCalled();
});
it('honors synchronous cancellation during acceptance before starting analysis', async () => {
  const { session, effects } = setup();
  effects.accept.mockImplementation(() => session.cancel());
  await session.run([new File([], 'a.csv')], effects);
  expect(effects.prepare).not.toHaveBeenCalled();
});
it('does not revive an earlier request when the session is reattached', async () => {
  const { session, effects } = setup();
  const pending = deferred<unknown>();
  effects.suggest.mockReturnValue(pending.promise);
  const run = session.run([new File([], 'a.csv')], effects);
  await vi.advanceTimersByTimeAsync(0);
  session.detach();
  session.attach();
  pending.resolve(questions);
  await run;
  expect(effects.questions).not.toHaveBeenCalled();
  expect(effects.navigate).not.toHaveBeenCalled();
});
