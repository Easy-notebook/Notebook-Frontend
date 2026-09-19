import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import HybridCell from './HybridCell';
const counters = vi.hoisted(() => ({ renders: 0 }));
vi.mock('./HybridCodeEditor', () => ({
  HybridCodeEditor: ({ current, content }: { current: boolean; content: string }) => {
    counters.renders++;
    return (
      <div data-testid="activation" data-current={String(current)}>
        {content}
      </div>
    );
  },
}));
afterEach(cleanup);
it('animates only explicitly generating cells and stops when generation completes', () => {
  const cell = { id: 'hybrid-generation', type: 'hybrid' as const, content: '' };
  const view = render(<HybridCell cell={cell} />);
  expect(screen.queryByText('Generating...')).toBeNull();
  expect(screen.queryByText('AI is Thinking...')).toBeNull();
  expect(view.container.querySelector('.animate-pulse')).toBeNull();
  view.rerender(<HybridCell cell={{ ...cell, metadata: { isGenerating: true } }} />);
  expect(screen.getByText('Generating...')).toBeDefined();
  expect(screen.getByText('AI is Thinking...')).toBeDefined();
  expect(view.container.querySelector('.animate-pulse')).not.toBeNull();
  view.rerender(
    <HybridCell cell={{ ...cell, metadata: { isGenerating: true, generationCompleted: true } }} />
  );
  expect(screen.queryByText('Generating...')).toBeNull();
  expect(view.container.querySelector('.animate-spin')).toBeNull();
  expect(view.container.querySelector('.animate-pulse')).toBeNull();
  view.rerender(<HybridCell cell={{ ...cell, metadata: { isGenerating: false } }} />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText('AI is Thinking...')).toBeNull();
  expect(view.container.querySelector('.bg-gradient-to-r')).not.toBeNull();
});
it('renders updated content once without an intermediate stale-code render', () => {
  const cell = { id: 'hybrid-update', type: 'hybrid' as const, content: '```python\nold\n```' };
  const view = render(<HybridCell cell={cell} />);
  const before = counters.renders;
  view.rerender(<HybridCell cell={{ ...cell, content: '```python\nnew\n```' }} />);
  expect(screen.getByTestId('activation').textContent).toBe('new');
  expect(counters.renders - before).toBe(1);
});
it('renders the prose on both sides of an editable hybrid code block', () => {
  render(
    <HybridCell
      cell={{
        id: 'hybrid-prose',
        type: 'hybrid',
        content: 'Before explanation\n\n```python\nx\n```\n\nAfter explanation',
      }}
    />
  );
  expect(screen.getByText('Before explanation')).toBeDefined();
  expect(screen.getByText('After explanation')).toBeDefined();
  expect(screen.getByTestId('activation')).toBeDefined();
});
it('reacts to current-cell changes without requiring a content edit or unrelated store updates', () => {
  const original = useStore.getState();
  useStore.setState({ currentCellId: null });
  try {
    render(
      <HybridCell
        cell={{ id: 'hybrid-current', type: 'hybrid', content: '```python\nprint(1)\n```' }}
      />
    );
    expect(screen.getByTestId('activation').getAttribute('data-current')).toBe('false');
    act(() => useStore.setState({ currentCellId: 'hybrid-current' }));
    expect(screen.getByText('Current Cell')).toBeDefined();
    expect(screen.getByTestId('activation').getAttribute('data-current')).toBe('true');
    const before = counters.renders;
    act(() => useStore.setState({ notebookTitle: 'Unrelated update' }));
    expect(counters.renders).toBe(before);
    act(() => useStore.setState({ currentCellId: 'other' }));
    expect(screen.queryByText('Current Cell')).toBeNull();
    expect(screen.getByTestId('activation').getAttribute('data-current')).toBe('false');
  } finally {
    cleanup();
    useStore.setState(original, true);
  }
});
