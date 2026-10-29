import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentThinking, ActionPayload, formatActionPayload } from './AgentThinking';
import type { AgentTurn } from '@Services/agent-cell/protocol';
const turn: AgentTurn = {
  id: 't',
  prompt: 'read',
  answer: '',
  status: 'completed',
  startedAt: 1000,
  endedAt: 4000,
  actions: [
    {
      id: 'a',
      name: 'read_cell',
      status: 'completed',
      arguments: '{"cellId":"notes","count":2}',
      result: { ok: true, data: { text: '<script>hello</script>' } },
    },
  ],
};
describe('Agent thinking evidence', () => {
  beforeAll(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
  );
  afterAll(() => vi.unstubAllGlobals());
  it('folds successful runs into duration and actual token usage, and can reopen', () => {
    const { rerender } = render(<AgentThinking turn={{ ...turn, status: 'running' }} live collapseCompleted />);
    expect(screen.getByRole('button', { name: /Thinking/ }).getAttribute('aria-expanded')).toBe('true');
    rerender(<AgentThinking turn={{ ...turn, usage: { inputTokens: 100, outputTokens: 23 } }} live={false} collapseCompleted />);
    const summary = screen.getByRole('button', { name: /Worked for 3s.*123 tokens/ });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(summary);
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /读取 Cell/ })).toBeTruthy();
  });
  it('parses JSON strings and retains incomplete JSON verbatim', () => {
    expect(formatActionPayload('{"a":[1,true,null]}')).toEqual({
      valid: true,
      text: '{\n  "a": [\n    1,\n    true,\n    null\n  ]\n}',
    });
    expect(formatActionPayload('{"a":')).toEqual({ valid: false, text: '{"a":' });
  });
  it('renders payload as inert highlighted text and only when expanded', () => {
    const { container } = render(<AgentThinking turn={turn} live={false} />);
    expect(screen.getByRole('button', { name: 'Worked for 3s' })).toBeTruthy();
    expect(screen.queryByLabelText('JSON')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /读取 Cell/ }));
    expect(screen.getAllByLabelText('JSON')).toHaveLength(2);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('.at-json-key')?.textContent).toBe('"cellId":');
    fireEvent.click(screen.getByRole('button', { name: 'Worked for 3s' }));
    expect(screen.queryByRole('list', { name: '行动步骤' })).toBeNull();
  });
  it('preserves raw payloads and never executes their markup', () => {
    const { container } = render(<ActionPayload value={'<img src=x onerror=alert(1)>'} />);
    expect(screen.getByLabelText('原始文本').textContent).toContain('<img');
    expect(container.querySelector('img')).toBeNull();
  });
  it('keeps an open JSON row mounted across new actions, payload updates and folding', () => {
    const { rerender, container } = render(<AgentThinking turn={turn} live={true} />);
    fireEvent.click(screen.getByRole('button', { name: /读取 Cell/ }));
    const json = screen.getAllByLabelText('JSON')[0];
    const additions = Array.from({ length: 6 }, (_, i) => ({
      id: `new-${i}`,
      name: 'list_cells',
      status: 'completed',
      arguments: {},
    }));
    const next = {
      ...turn,
      actions: [{ ...turn.actions[0], result: { ok: true, data: 'updated' } }, ...additions],
    };
    rerender(<AgentThinking turn={next} live={true} />);
    expect(screen.getAllByLabelText('JSON')[0]).toBe(json);
    expect(container.querySelector('[data-action-id="a"]')?.hasAttribute('hidden')).toBe(false);
    expect(screen.getAllByLabelText('JSON')[1].textContent).toContain('updated');
    const header = container.querySelector('.at-header')!;
    fireEvent.click(header);
    expect(container.querySelector('.at-collapse')?.hasAttribute('inert')).toBe(true);
    fireEvent.click(header);
    expect(screen.getAllByLabelText('JSON')[0]).toBe(json);
  });
  it('uses lifecycle status instead of pretending a cancelled run succeeded', () => {
    render(<AgentThinking turn={{ ...turn, status: 'cancelled' }} live={false} />);
    expect(screen.getByRole('button', { name: 'Cancelled after 3s' })).toBeTruthy();
  });
});
