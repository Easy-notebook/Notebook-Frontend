import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePreviewStart } from './usePreviewStart';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('starts immediately for editing and stays started when editing ends', () => {
  const observe = vi.fn();
  const unobserve = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = observe;
      unobserve = unobserve;
      disconnect() {}
    }
  );
  function Preview({ editing }: { editing: boolean }) {
    const { container, active } = usePreviewStart<HTMLSpanElement>(editing);
    return (
      <span ref={container} data-testid="preview">
        {String(active)}
      </span>
    );
  }
  const view = render(<Preview editing={false} />);
  expect(screen.getByTestId('preview').textContent).toBe('false');
  expect(observe).toHaveBeenCalledTimes(1);
  view.rerender(<Preview editing />);
  expect(screen.getByTestId('preview').textContent).toBe('true');
  expect(unobserve).toHaveBeenCalledTimes(1);
  view.rerender(<Preview editing={false} />);
  expect(screen.getByTestId('preview').textContent).toBe('true');
  expect(observe).toHaveBeenCalledTimes(1);
});
