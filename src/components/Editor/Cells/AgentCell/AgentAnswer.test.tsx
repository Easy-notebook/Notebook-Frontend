import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentAnswer } from './AgentAnswer';
import { answerSources } from './AnswerSources';
import type { AgentTurn } from '@Services/agent-cell/protocol';
vi.mock('../../MarkdownCodePreview', () => ({
  markdownCodeComponents: {},
  markdownSoftLineComponents: {},
}));
const turn: AgentTurn = {
  id: 'turn',
  prompt: 'question',
  answer: 'Evidence [note](#cell-note).',
  status: 'completed',
  startedAt: 1000,
  endedAt: 4500,
  actions: [
    {
      id: 'read',
      name: 'read_cell',
      status: 'completed',
      result: { ok: true, data: { cellId: 'note', content: '# Source title\nOriginal evidence.' } },
    },
  ],
};
it('renders only successful source reads and deduplicates the cell identity', () => {
  expect(answerSources({ ...turn, actions: [...turn.actions, ...turn.actions] })).toHaveLength(1);
  expect(
    answerSources({ ...turn, actions: [{ ...turn.actions[0], status: 'failed' }] })
  ).toHaveLength(0);
});
it('opens real source evidence from a citation and closes with Escape', () => {
  render(<AgentAnswer text={turn.answer} turn={turn} />);
  fireEvent.click(screen.getByRole('button', { name: '来源：Source title' }));
  expect(screen.getByLabelText('来源预览')).toHaveTextContent('Original evidence.');
  fireEvent.keyDown(screen.getByLabelText('AI 回答'), { key: 'Escape' });
  expect(screen.queryByLabelText('来源预览')).toBeNull();
});
it('offers only retry and disables it during streaming', () => {
  const regenerate = vi.fn();
  const view = render(<AgentAnswer text="Answer" turn={turn} onRegenerate={regenerate} />);
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(regenerate).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('复制回答')).toBeNull();
  expect(screen.queryByLabelText('回答有帮助')).toBeNull();
  expect(screen.queryByLabelText('回答需改进')).toBeNull();
  view.rerender(
    <AgentAnswer text="Answer" turn={{ ...turn, status: 'running' }} onRegenerate={regenerate} />
  );
  expect(screen.getByLabelText('重试')).toBeDisabled();
});
it('keeps citation DOM and keyboard focus stable while evidence and text update', () => {
  const view = render(<AgentAnswer text={turn.answer} turn={turn} />);
  const citation = screen.getByRole('button', { name: '来源：Source title' });
  citation.focus();
  fireEvent.mouseEnter(citation);
  expect(screen.getByRole('button', { name: '来源：Source title' })).toBe(citation);
  fireEvent.click(citation);
  expect(document.activeElement).toBe(citation);
  view.rerender(
    <AgentAnswer
      text={turn.answer + ' More streamed text.'}
      turn={{ ...turn, actions: [...turn.actions], status: 'running' }}
    />
  );
  expect(screen.getByRole('button', { name: '来源：Source title' })).toBe(citation);
  expect(document.activeElement).toBe(citation);
  expect(screen.getByLabelText('来源预览')).toHaveTextContent('Original evidence.');
});

it('uses notebook Markdown tables and read-only task lists', () => {
  render(
    <AgentAnswer
      text={'| Name | Value |\n| --- | --- |\n| note | 5 |\n\n- [x] verified\n\n~~old~~'}
    />
  );
  expect(screen.getByRole('table')).toHaveTextContent('note');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByText('old').tagName).toBe('DEL');
});
