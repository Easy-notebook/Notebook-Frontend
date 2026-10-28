import { useState } from 'react';
import useStore from '@Store/notebookStore';
import { AgentCell } from '@Editor/Cells/AgentCell/AgentCell';
/** The sidebar is another view of notebook-owned conversations, not a second execution store. */
export function NotebookAgentChat() {
  const cells = useStore((state) => state.cells);
  const [selected, setSelected] = useState('');
  const agents = cells.filter((cell) => cell.type === 'agent');
  if (!agents.length) return null;
  const current = agents.find((cell) => cell.id === selected) ?? agents[agents.length - 1];
  return (
    <section aria-label="Notebook Agent 聊天" className="av-theme">
      <label className="av-live-controls">
        Notebook Agent
        <select
          aria-label="选择 Agent 会话"
          value={current.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {agents.map((cell, index) => (
            <option key={cell.id} value={cell.id}>
              {cell.metadata?.agent?.provider === 'claude' ? 'Claude Code' : 'Codex'} · {index + 1}
            </option>
          ))}
        </select>
      </label>
      <AgentCell key={current.id} cellId={current.id} />
    </section>
  );
}
