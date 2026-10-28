import { expect, it } from 'vitest';
import { agentFenceCell, agentFenceProvider } from './AgentFence';
it('recognizes only explicit agent fence languages', () => {
  expect(agentFenceProvider('agent:codex')).toBe('codex');
  expect(agentFenceProvider('agent:claude')).toBe('claude');
  expect(agentFenceProvider('aal')).toBeNull();
  expect(agentFenceProvider('mermaid')).toBeNull();
});
it('creates isolated sessions and preserves the initial prompt', () => {
  const a = agentFenceCell('a', 'codex', 'inspect');
  const b = agentFenceCell('b', 'claude');
  expect(a.content).toBe('inspect');
  expect(a.metadata?.agent.provider).toBe('codex');
  expect(b.metadata?.agent.provider).toBe('claude');
  expect(a.metadata?.agent.sessionId).not.toBe(b.metadata?.agent.sessionId);
});
