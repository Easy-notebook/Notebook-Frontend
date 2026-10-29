/** The editor scrolls only its nearest viewport, never the surrounding workspace. */
export function writingScroller(element: HTMLElement): HTMLElement | null {
  let parent: HTMLElement | null = element.parentElement;
  while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY))
    parent = parent.parentElement;
  return parent;
}

export function revealWritingPosition(scroller: HTMLElement, top: number, centered: boolean) {
  const viewport = scroller.getBoundingClientRect();
  const readingLine = viewport.top + (centered ? scroller.clientHeight * 0.45 : 64);
  const delta = top - readingLine;
  // Smooth scrolling restarted on every keystroke lags behind the caret.
  if (Math.abs(delta) > 2) scroller.scrollBy({ top: delta, behavior: 'instant' });
}
