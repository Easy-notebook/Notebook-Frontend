import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCodeContentHeight } from './useCodeContentHeight';

it('measures active content and disconnects on suspension without accepting stale callbacks', () => {
  const element = document.createElement('div');
  element.append(document.createElement('div'));
  let height = 600;
  Object.defineProperty(element, 'scrollHeight', { get: () => height });
  const ref = { current: element };
  const publish = vi.fn();
  const observe = vi.fn();
  const disconnect = vi.fn();
  let resize!: () => void;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  const view = renderHook(({ active }) => useCodeContentHeight(ref, active, publish), {
    initialProps: { active: false },
  });
  try {
    expect(publish).not.toHaveBeenCalled();
    view.rerender({ active: true });
    expect(publish).toHaveBeenCalledExactlyOnceWith(600);
    expect(observe).toHaveBeenCalledWith(element);
    expect(observe).toHaveBeenCalledWith(element.firstElementChild);
    height = 900;
    act(() => resize());
    expect(publish).toHaveBeenLastCalledWith(900);
    view.rerender({ active: false });
    expect(disconnect).toHaveBeenCalledOnce();
    publish.mockClear();
    act(() => resize());
    expect(publish).not.toHaveBeenCalled();
    view.rerender({ active: true });
    expect(publish).toHaveBeenCalledExactlyOnceWith(900);
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});
