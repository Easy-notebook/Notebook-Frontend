import { afterEach, expect, it, vi } from 'vitest';
import { observePreview } from './previewVisibility';

function visibleEntry(target: Element): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return { target, isIntersecting: true, intersectionRatio: 1, time: 0,
    boundingClientRect: rect, intersectionRect: rect, rootBounds: null };
}

afterEach(() => vi.unstubAllGlobals());
it('ignores queued notifications from a disconnected observer generation', () => {
  const reports: IntersectionObserverCallback[] = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { reports.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const element = document.createElement('div');
  observePreview(element, vi.fn())();
  const listener = vi.fn();
  const release = observePreview(element, listener);
  const entries = [visibleEntry(element)];
  try {
    reports[0](entries, {} as IntersectionObserver);
    expect(listener).not.toHaveBeenCalled();
    reports[1](entries, {} as IntersectionObserver);
    expect(listener).toHaveBeenCalledExactlyOnceWith(true);
  } finally { release(); }
});
it('does not let repeated cleanup detach a newer subscription on the same element', () => {
  let report!: IntersectionObserverCallback;
  const unobserve = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { report = callback; }
    observe() {}
    unobserve = unobserve;
    disconnect() {}
  });
  const element = document.createElement('div');
  const old = observePreview(element, vi.fn());
  old();
  const listener = vi.fn();
  const current = observePreview(element, listener);
  try {
    old();
    report([visibleEntry(element)], {} as IntersectionObserver);
    expect(listener).toHaveBeenCalledWith(true);
    expect(unobserve).toHaveBeenCalledTimes(1);
  } finally { current(); }
});
it('shares one observer across 1000 previews and releases it after the last unmount', () => {
  const construct = vi.fn();
  const disconnect = vi.fn();
  const unobserve = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor() {
        construct();
      }
      observe() {}
      unobserve = unobserve;
      disconnect = disconnect;
    }
  );
  const cleanup = Array.from({ length: 1000 }, () =>
    observePreview(document.createElement('div'), vi.fn())
  );
  expect(construct).toHaveBeenCalledTimes(1);
  for (const release of cleanup.slice(0, -1)) release();
  expect(disconnect).not.toHaveBeenCalled();
  cleanup[999]();
  expect(unobserve).toHaveBeenCalledTimes(1000);
  expect(disconnect).toHaveBeenCalledTimes(1);
});
