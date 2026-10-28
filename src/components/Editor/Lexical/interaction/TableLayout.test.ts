import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameTask } from './FrameTask';
import { resizeColumnPair } from './TableColumnResizeController';

afterEach(() => vi.unstubAllGlobals());

describe('table layout scheduling', () => {
  it('coalesces a burst into one frame and can schedule again after execution', () => {
    const frames: FrameRequestCallback[] = [];
    const request = vi.fn((callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('requestAnimationFrame', request);
    const paint = vi.fn();
    const task = new FrameTask(paint);
    for (let index = 0; index < 1000; index++) task.schedule();
    expect(request).toHaveBeenCalledTimes(1);
    frames[0](0);
    expect(paint).toHaveBeenCalledTimes(1);
    task.schedule();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('cancels pending layout work on teardown', () => {
    vi.stubGlobal('requestAnimationFrame', () => 17);
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const task = new FrameTask(vi.fn());
    task.schedule();
    task.cancel();
    task.cancel();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(17);
  });
});

describe('column resize geometry', () => {
  it('conserves total width and does not mutate the document snapshot', () => {
    const widths = Object.freeze([146, 146]);
    expect(resizeColumnPair(widths, 0, 40)).toEqual({
      column: 0,
      width: 186,
      neighbor: 1,
      neighborWidth: 106,
    });
    expect(widths).toEqual([146, 146]);
  });
  it('clamps both columns to the minimum width', () => {
    expect(resizeColumnPair([146, 146], 0, 1000).neighborWidth).toBe(48);
    expect(resizeColumnPair([146, 146], 0, -1000).width).toBe(48);
  });
  it('uses the previous neighbor at the final boundary and handles a single column', () => {
    expect(resizeColumnPair([100, 100], 1, 20)).toEqual({
      column: 1,
      width: 120,
      neighbor: 0,
      neighborWidth: 80,
    });
    expect(resizeColumnPair([100], 0, -1000).width).toBe(48);
  });
});
