import { afterEach, expect, it, vi } from 'vitest';
import { getAsyncStateMachine, resetAsyncStateMachine } from './AsyncStateMachineAdapter';
import { StateFactory } from '../states/StateFactory';

afterEach(() => {
  resetAsyncStateMachine();
  vi.restoreAllMocks();
});

it('shares concurrent initialization and installs the client once', async () => {
  resetAsyncStateMachine();
  const install = vi.spyOn(StateFactory, 'setApiClient');
  const [first, second] = await Promise.all([getAsyncStateMachine(), getAsyncStateMachine()]);
  expect(first).toBe(second);
  expect(await getAsyncStateMachine()).toBe(first);
  expect(install).toHaveBeenCalledOnce();
});

it('prevents an initialization invalidated by reset from installing stale dependencies', async () => {
  resetAsyncStateMachine();
  const install = vi.spyOn(StateFactory, 'setApiClient');
  const old = getAsyncStateMachine();
  const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  resetAsyncStateMachine();
  const replacement = getAsyncStateMachine();
  await rejected;
  const current = await replacement;
  expect(await getAsyncStateMachine()).toBe(current);
  expect(install).toHaveBeenCalledOnce();
});

it('allows retry after initialization fails', async () => {
  resetAsyncStateMachine();
  const failure = new Error('cannot install workflow client');
  const install = vi.spyOn(StateFactory, 'setApiClient').mockImplementationOnce(() => {
    throw failure;
  });
  await expect(getAsyncStateMachine()).rejects.toBe(failure);
  const current = await getAsyncStateMachine();
  expect(await getAsyncStateMachine()).toBe(current);
  expect(install).toHaveBeenCalledTimes(2);
});
