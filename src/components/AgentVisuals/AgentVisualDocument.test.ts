import { describe, expect, it } from 'vitest';
import { parseAgentVisual } from './AgentVisualDocument';
import { indexTree, laneGeometry } from './model';
describe('agent visualization document', () => {
  it('aggregates own costs exactly once', () => {
    const root = {
      id: 'r',
      name: 'root',
      task: 'work',
      status: 'running' as const,
      cost: 1,
      children: [{ id: 'c', name: 'child', task: 'work', status: 'done' as const, cost: 2 }],
    };
    expect(indexTree(root).totals.get('r')).toBe(3);
  });
  it('rejects duplicate identities and excessive nesting', () => {
    const root = {
      id: 'x',
      name: 'root',
      task: 'work',
      status: 'done',
      children: [{ id: 'x', name: 'child', task: 'work', status: 'done' }],
    };
    expect(() => parseAgentVisual('agent-tree', JSON.stringify({ root }))).toThrow('Duplicate');
    expect(() => parseAgentVisual('agent-tree', '['.repeat(40) + '0' + ']'.repeat(40))).toThrow(
      'nesting'
    );
  });
  it('validates handoff ownership and temporal order', () => {
    const document = {
      agents: [{ id: 'a', name: 'Agent' }],
      tasks: [{ id: 't', agentId: 'missing', title: 'task', status: 'done', start: 1, end: 2 }],
    };
    expect(() => parseAgentVisual('agent-lanes', JSON.stringify(document))).toThrow(
      'Unknown agent'
    );
    document.tasks[0].agentId = 'a';
    document.tasks[0].end = 0;
    expect(() => parseAgentVisual('agent-lanes', JSON.stringify(document))).toThrow('ends before');
  });
  it('clips tasks to the visible time window', () => {
    const task = { id: 't', agentId: 'a', title: 'task', status: 'running' as const, start: 0 };
    expect(laneGeometry(task, 200, 100)).toEqual({ left: 0, width: 100 });
    expect(laneGeometry({ ...task, end: 50 }, 200, 100)).toBeNull();
  });
  it('rejects arbitrary avatar objects from JSON', () => {
    expect(() =>
      parseAgentVisual(
        'agent-tree',
        JSON.stringify({
          root: { id: 'r', name: 'root', task: 'work', status: 'done', avatar: { html: 'unsafe' } },
        })
      )
    ).toThrow();
  });
});
