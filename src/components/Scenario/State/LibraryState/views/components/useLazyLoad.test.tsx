import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLazyLoad } from './useLazyLoad';

let notify: (visible: boolean) => void;
const disconnect = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = (isIntersecting) =>
          callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function Preview({
  delay = 100,
  freezeOnceVisible = true,
}: {
  delay?: number;
  freezeOnceVisible?: boolean;
}) {
  const { ref, isIntersecting, hasBeenVisible } = useLazyLoad({ delay, freezeOnceVisible });
  return <div ref={ref}>{`${isIntersecting}:${hasBeenVisible}`}</div>;
}

it('cancels delayed loading on exit and waits for a new entry', () => {
  const { container } = render(<Preview />);
  act(() => notify(true));
  act(() => vi.advanceTimersByTime(50));
  act(() => notify(false));
  act(() => vi.advanceTimersByTime(100));
  expect(container.textContent).toBe('false:false');
  act(() => notify(true));
  act(() => vi.advanceTimersByTime(100));
  expect(container.textContent).toBe('true:true');
});

it('owns only one pending delay across repeated visible observations', () => {
  const { container } = render(<Preview />);
  act(() => notify(true));
  act(() => vi.advanceTimersByTime(50));
  act(() => notify(true));
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(50));
  expect(container.textContent).toBe('true:true');
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels pending loading when unmounted', () => {
  const { unmount } = render(<Preview />);
  act(() => notify(true));
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('revokes pending work when observation options change', () => {
  const { container, rerender } = render(<Preview />);
  act(() => notify(true));
  const staleNotify = notify;
  act(() => vi.advanceTimersByTime(50));
  rerender(<Preview delay={200} />);
  act(() => staleNotify(true));
  act(() => vi.advanceTimersByTime(100));
  expect(container.textContent).toBe('false:false');
  act(() => notify(true));
  act(() => vi.advanceTimersByTime(200));
  expect(container.textContent).toBe('true:true');
});

it('tracks exit after immediate loading when visibility is not frozen', () => {
  const { container } = render(<Preview delay={0} freezeOnceVisible={false} />);
  act(() => notify(true));
  expect(container.textContent).toBe('true:true');
  act(() => notify(false));
  expect(container.textContent).toBe('false:true');
  expect(vi.getTimerCount()).toBe(0);
});
