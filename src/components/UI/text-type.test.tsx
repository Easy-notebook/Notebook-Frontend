import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { gsap } from 'gsap';
import TextType from './text-type';

vi.mock('gsap', () => ({
  gsap: {
    set: vi.fn(),
    to: vi.fn(() => ({ kill: vi.fn() })),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('releases each cursor animation before replacement, hiding, and unmounting', () => {
  const { rerender, unmount } = render(<TextType text="Hello" />);
  const first = vi.mocked(gsap.to).mock.results[0].value;
  rerender(<TextType text="Hello" cursorBlinkDuration={1} />);
  expect(first.kill).toHaveBeenCalledOnce();
  const second = vi.mocked(gsap.to).mock.results[1].value;
  rerender(<TextType text="Hello" showCursor={false} />);
  expect(second.kill).toHaveBeenCalledOnce();
  rerender(<TextType text="Hello" />);
  const third = vi.mocked(gsap.to).mock.results[2].value;
  unmount();
  expect(third.kill).toHaveBeenCalledOnce();
});

it('leaves no cursor animations alive after StrictMode teardown', () => {
  const { unmount } = render(
    <StrictMode>
      <TextType text="Hello" />
    </StrictMode>
  );
  unmount();
  expect(gsap.to).toHaveBeenCalledTimes(2);
  for (const result of vi.mocked(gsap.to).mock.results) {
    expect(result.value.kill).toHaveBeenCalledOnce();
  }
});

it('renders an empty sequence without scheduling typing work', () => {
  vi.useFakeTimers();
  try {
    const { container, unmount } = render(
      <TextType text={[]} hideCursorWhileTyping showCursor={false} />
    );
    expect(container.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('cancels pending typing when unmounted during the initial delay or a character delay', () => {
  vi.useFakeTimers();
  try {
    for (const elapsed of [0, 100]) {
      const { unmount } = render(
        <TextType text="Hello" initialDelay={100} typingSpeed={50} showCursor={false} />
      );
      act(() => vi.advanceTimersByTime(elapsed));
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    }
  } finally {
    vi.useRealTimers();
  }
});
