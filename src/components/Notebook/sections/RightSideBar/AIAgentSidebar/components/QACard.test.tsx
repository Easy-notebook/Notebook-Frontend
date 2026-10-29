import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QAItem } from '@Store/models/agent';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@Editor/NotebookContext/FactCapture', () => ({
  FactCapture: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/AgentVisuals/shared', () => ({
  AgentAvatar: ({ name }: { name: string }) => <span>{name}</span>,
  AgentDialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
}));
vi.mock('@/components/AgentVisuals/ReadingViewport', () => ({
  ReadingViewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
import QACard from './QACard';
const answer: QAItem = {
  id: 'qa',
  type: 'assistant',
  content: '',
  timestamp: '12:00',
  resolved: false,
  onProcess: true,
  thinkingStartAtMs: 1000,
};
const card = (qa: QAItem) => <QACard qa={qa} index={0} totalCount={1} />;
it('stops showing thinking after interruption and retains partial Markdown', () => {
  const view = render(card(answer));
  expect(screen.getAllByText('rightSideBar.thinking').length).toBeGreaterThan(0);
  view.rerender(card({ ...answer, onProcess: false, thinkingEndAtMs: 3000 }));
  expect(screen.queryByText('rightSideBar.thinking')).toBeNull();
  expect(screen.getByText('rightSideBar.responseInterrupted')).toBeInTheDocument();
  view.rerender(card({ ...answer, onProcess: false, content: '**partial response**' }));
  expect(screen.getByText('partial response').tagName).toBe('STRONG');
});
it('uses shared readonly Markdown without modifying source indentation or headings', () => {
  render(
    card({
      ...answer,
      onProcess: false,
      resolved: true,
      content: '# Section 1\n\n| Name | Value |\n| --- | --- |\n| A | 5 |\n\n- [x] done',
    })
  );
  expect(screen.getByRole('heading', { name: 'Section 1' })).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('A');
  expect(screen.getByRole('checkbox')).toBeDisabled();
});
it('keeps raw action evidence and timestamp in details without inventing successful execution', () => {
  render(
    card({
      ...answer,
      onProcess: false,
      resolved: true,
      content: 'Result',
      toolCalls: [{ name: 'read_cell', arguments: '{"cellId":"a"}', result: { ok: true } }],
    })
  );
  expect(screen.queryByText('12:00')).toBeNull();
  expect(screen.queryByLabelText('JSON')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '回答详情' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('12:00');
  expect(screen.getByLabelText('JSON')).toHaveTextContent('read_cell');
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
});
it('shows successful empty responses without a running indicator', () => {
  render(card({ ...answer, resolved: true, onProcess: false }));
  expect(screen.getByText('rightSideBar.noContent')).toBeInTheDocument();
});
