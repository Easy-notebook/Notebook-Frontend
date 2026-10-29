import { newAgentCellData, type AgentProvider } from './protocol';
import type { Cell } from '@Store/models';

/** Reserved fence languages represent an interactive agent, never executable code. */
export function agentFenceProvider(language: string): AgentProvider | null {
  if (language === 'agent:codex') return 'codex';
  if (language === 'agent:claude') return 'claude';
  return null;
}
export function agentFenceCell(id: string, provider: AgentProvider, prompt = ''): Cell {
  return {
    id,
    type: 'agent',
    content: prompt,
    outputs: [],
    metadata: { agent: { ...newAgentCellData(), provider } },
  };
}
