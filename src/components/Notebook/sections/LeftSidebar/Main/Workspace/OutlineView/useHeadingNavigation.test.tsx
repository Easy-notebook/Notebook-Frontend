import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useHeadingNavigation } from './useHeadingNavigation';

let frames: Map<number, FrameRequestCallback>;
let root: HTMLDivElement;
function step() {
  const work = [...frames.values()];
  frames.clear();
  act(() => {
    work.forEach((callback) => callback(0));
  });
}
beforeEach(() => {
  frames = new Map();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  root = document.createElement('div');
  root.className = 'tiptap-notebook-editor';
  root.innerHTML =
    '<h2 id="phase--repeat">First</h2><h2 id="phase--repeat-2">Second</h2><h2 data-base-id="phase" data-heading-key="key--suffix">Third</h2>';
  document.body.appendChild(root);
  for (const element of root.children) (element as HTMLElement).scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  root.remove();
  vi.unstubAllGlobals();
});

it('navigates only to the requested duplicate heading without guessing a scroll container', () => {
  const view = renderHook(useHeadingNavigation);
  view.result.current('phase--repeat-2');
  step();
  step();
  expect(root.children[0].scrollIntoView).not.toHaveBeenCalled();
  expect(root.children[1].scrollIntoView).toHaveBeenCalledExactlyOnceWith({
    behavior: 'instant',
    block: 'start',
  });
  expect(frames.size).toBe(0);
});

it('cancels superseded navigation and pending work on unmount', () => {
  const view = renderHook(useHeadingNavigation);
  view.result.current('phase--repeat');
  step();
  view.result.current('phase--repeat-2');
  step();
  step();
  expect(root.children[0].scrollIntoView).not.toHaveBeenCalled();
  expect(root.children[1].scrollIntoView).toHaveBeenCalledTimes(1);
  view.result.current('phase--repeat');
  step();
  view.unmount();
  step();
  expect(root.children[0].scrollIntoView).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

it('resolves heading attributes without truncating keys and ignores missing targets', () => {
  const view = renderHook(useHeadingNavigation);
  view.result.current('phase--key--suffix');
  step();
  step();
  expect(root.children[2].scrollIntoView).toHaveBeenCalledTimes(1);
  view.result.current('missing');
  step();
  step();
  expect(root.children[2].scrollIntoView).toHaveBeenCalledTimes(1);
});
