import { describe, it, expect } from 'vitest';
import { projectAgentRun } from './AgentRunProjection';
import { newAgentCellData, type AgentTurn } from '@Services/agent-cell/protocol';
describe('real execution projection', () => {
  it('uses actual event timestamps and preserves tool identity in both views', () => {
    const data = newAgentCellData('claude');
    const turn: AgentTurn = {
      id: 'run',
      prompt: 'edit',
      answer: 'Streaming',
      status: 'running',
      startedAt: 100,
      actions: [
        {
          id: 'call',
          name: 'update_cell',
          status: 'waiting',
          startedAt: 120,
          kind: 'tool',
          arguments: { cellId: 'code' },
        },
      ],
    };
    const view = projectAgentRun(data, turn, true);
    expect(view.root.name).toBe('Claude Code');
    expect(view.root.children?.[0]).toMatchObject({ id: 'call', status: 'waiting', started: 120 });
    expect(view.tasks[0]).toMatchObject({ id: 'call', start: 120, status: 'waiting' });
    expect(view.root.cost).toBeUndefined();
    expect(view.root.model).toBeUndefined();
  });
  it('never shows persisted approvals as actionable after a connection is lost', () => {
    const view = projectAgentRun(
      newAgentCellData(),
      {
        id: 'run',
        prompt: 'edit',
        answer: '',
        status: 'running',
        actions: [{ id: 'call', name: 'update_cell', status: 'waiting' }],
      },
      false
    );
    expect(view.root.status).toBe('stopped');
    expect(view.root.children?.[0].status).toBe('stopped');
    expect(view.tasks).toEqual([]);
  });
});
