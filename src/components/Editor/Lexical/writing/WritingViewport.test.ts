import { expect, it, vi } from 'vitest';
import { revealWritingPosition, writingScroller } from './WritingViewport';

it('finds a short document viewport before it overflows', () => {
  const viewport = document.createElement('div');
  viewport.style.overflowY = 'auto';
  const content = document.createElement('div');
  viewport.append(content);
  document.body.append(viewport);
  expect(writingScroller(content)).toBe(viewport);
  viewport.remove();
});

it('centers the current line within its own viewport without smooth-scroll restart', () => {
  const viewport = document.createElement('div');
  Object.defineProperty(viewport, 'clientHeight', { value: 600 });
  viewport.getBoundingClientRect = () => ({ top: 80 }) as DOMRect;
  viewport.scrollBy = vi.fn();
  revealWritingPosition(viewport, 650, true);
  expect(viewport.scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'instant' });
  revealWritingPosition(viewport, 350, true);
  expect(viewport.scrollBy).toHaveBeenCalledTimes(1);
});
