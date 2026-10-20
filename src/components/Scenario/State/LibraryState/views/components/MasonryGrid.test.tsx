import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { MasonryGrid } from './MasonryGrid';

// Layout assertions exclude Framer's temporary exiting copies.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: HTMLAttributes<HTMLDivElement>) => (
      <div className={className}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function columnContents(container: HTMLElement) {
  return Array.from(container.firstElementChild!.children, (column) => column.textContent);
}

it('distributes rendered cards without counting conditional placeholders', () => {
  vi.stubGlobal('innerWidth', 800);
  const { container } = render(
    <MasonryGrid>
      {false}
      <article key="a">A</article>
      {null}
      <article key="b">B</article>
      {undefined}
      <article key="c">C</article>
      <article key="d">D</article>
    </MasonryGrid>
  );
  expect(columnContents(container)).toEqual(['AC', 'BD']);
});

it('redistributes cards after a debounced breakpoint change', async () => {
  vi.stubGlobal('innerWidth', 500);
  const { container, unmount } = render(
    <MasonryGrid>
      {['A', 'B', 'C', 'D'].map((title) => (
        <article key={title}>{title}</article>
      ))}
    </MasonryGrid>
  );
  expect(columnContents(container)).toEqual(['ABCD']);
  vi.stubGlobal('innerWidth', 1300);
  fireEvent.resize(window);
  await waitFor(() => expect(columnContents(container)).toEqual(['A', 'B', 'C', 'D']));
  unmount();
});
