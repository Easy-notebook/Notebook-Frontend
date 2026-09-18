import { afterEach, expect, it, vi } from 'vitest';
import { observePreview } from './previewVisibility';

afterEach(() => vi.unstubAllGlobals());
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
