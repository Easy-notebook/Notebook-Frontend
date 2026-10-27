import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mathRenderService } from './MathRenderService';
import { useMathPreview } from './useMathPreview';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('coalesces formula editing before parsing and does not reparse a ready preview when editing ends', async () => {
  vi.useFakeTimers();
  const render = vi.spyOn(mathRenderService, 'render').mockResolvedValue('html');
  const view = renderHook(({ source, editing }) => useMathPreview(source, false, editing), {
    initialProps: { source: 'x', editing: true },
  });
  for (const source of ['x^', 'x^2', 'x^2+1']) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    view.rerender({ source, editing: true });
  }
  expect(render).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(render).toHaveBeenCalledExactlyOnceWith('x^2+1', false, expect.any(AbortSignal));
  expect(view.result.current.html).toBe('html');
  view.rerender({ source: 'x^2+1', editing: false });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(render).toHaveBeenCalledTimes(1);
});

it('flushes the latest source on leaving editing and cancels deferred work on unmount', async () => {
  vi.useFakeTimers();
  const render = vi.spyOn(mathRenderService, 'render').mockResolvedValue('html');
  const view = renderHook(({ editing }) => useMathPreview('x', true, editing), {
    initialProps: { editing: true },
  });
  view.rerender({ editing: false });
  await act(async () => {});
  expect(render).toHaveBeenCalledTimes(1);
  const other = renderHook(() => useMathPreview('cancelled', false, true));
  other.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(render).toHaveBeenCalledTimes(1);
});
