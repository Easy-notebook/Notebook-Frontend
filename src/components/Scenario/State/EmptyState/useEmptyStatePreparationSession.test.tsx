import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@Store/notebookStore', async () => {
  const { create } = await import('zustand');
  return { default: create(() => ({ notebookId: null as string | null })) };
});
import useStore from '@Store/notebookStore';
import { useEmptyStatePreparationSession } from './useEmptyStatePreparationSession';
import type { PreparationEffects } from './EmptyStatePreparationSession';
afterEach(() => {
  useStore.setState({ notebookId: null });
  vi.useRealTimers();
});
it('preserves initial notebook creation, cancels away-and-back switches and cleans up under StrictMode', async () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useEmptyStatePreparationSession(), { wrapper: StrictMode });
  const effects: PreparationEffects = {
    upload: vi.fn().mockResolvedValue([]),
    accept: vi.fn(),
    prepare: vi.fn().mockResolvedValue({ columns: [], info: '' }),
    suggest: vi.fn(),
    questions: vi.fn(),
    defaultQuestion: vi.fn(),
    navigate: vi.fn(),
    loading: vi.fn(),
    error: vi.fn(),
  };
  let first!: Promise<void>;
  await act(async () => {
    first = hook.result.current.run([new File([], 'a.pdf')], effects);
    useStore.setState({ notebookId: 'created' });
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(vi.getTimerCount()).toBe(1);
  act(() => {
    useStore.setState({ notebookId: 'other' });
    useStore.setState({ notebookId: 'created' });
  });
  await first;
  expect(vi.getTimerCount()).toBe(0);
  expect(effects.navigate).not.toHaveBeenCalled();
  let second!: Promise<void>;
  await act(async () => {
    second = hook.result.current.run([new File([], 'b.pdf')], effects);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(vi.getTimerCount()).toBe(1);
  hook.unmount();
  await second;
  expect(vi.getTimerCount()).toBe(0);
  expect(effects.navigate).not.toHaveBeenCalled();
});
