import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { QAItem } from '@Store/models/agent';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/UI/magic/shiny-text', () => ({
  default: ({ text }: { text: string }) => <span data-testid="thinking">{text}</span>,
}));
vi.mock('@RightSidebar/components/ExpandableText', () => ({
  default: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock('@RightSidebar/components/ToolCallIndicator', () => ({ default: () => null }));
vi.mock('@/components/UI/card/SpotlightCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
import QACard from './QACard';
const answer: QAItem = {
  id: 'qa',
  type: 'assistant',
  content: '',
  timestamp: '',
  resolved: false,
  onProcess: true,
  thinkingStartAtMs: 1000,
};
const card = (qa: QAItem) => <QACard qa={qa} index={0} totalCount={1} />;
afterEach(() => vi.useRealTimers());
it('replaces thinking with interrupted status and stops its timer on cancellation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const view = render(card(answer));
  expect(screen.getByTestId('thinking')).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByText('(2s)')).toBeInTheDocument();
  view.rerender(card({ ...answer, onProcess: false, thinkingEndAtMs: 3000 }));
  expect(screen.queryByTestId('thinking')).not.toBeInTheDocument();
  expect(screen.getByText('rightSideBar.responseInterrupted')).toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});
it('shows empty content rather than thinking for a successful empty answer', () => {
  render(card({ ...answer, resolved: true, onProcess: false, thinkingEndAtMs: 2000 }));
  expect(screen.getByText('rightSideBar.noContent')).toBeInTheDocument();
  expect(screen.queryByTestId('thinking')).not.toBeInTheDocument();
});
it('retains a partial answer after interruption', () => {
  render(card({ ...answer, content: 'partial response', onProcess: false, thinkingEndAtMs: 2000 }));
  expect(screen.getByText('partial response')).toBeInTheDocument();
  expect(screen.queryByTestId('thinking')).not.toBeInTheDocument();
});
it('does not run a timer for user snapshots or inactive answers with an old start timestamp', () => {
  vi.useFakeTimers();
  const view = render(card({ ...answer, type: 'user', content: 'question' }));
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(card({ ...answer, onProcess: false }));
  expect(vi.getTimerCount()).toBe(0);
});
it('restarts the timer when a new answer begins', () => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  const view = render(card({ ...answer, onProcess: false, thinkingEndAtMs: 2000 }));
  view.rerender(card({ ...answer, thinkingStartAtMs: 5000 }));
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByTestId('thinking')).toBeInTheDocument();
  expect(screen.getByText('(1s)')).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
