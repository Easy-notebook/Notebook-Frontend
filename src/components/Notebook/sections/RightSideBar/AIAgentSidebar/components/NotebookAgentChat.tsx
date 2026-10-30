import { useNotebookConversation } from '@Services/agent-cell/NotebookConversation';
import useStore from '@Store/notebookStore';
import { AgentCell } from '@Editor/Cells/AgentCell/AgentCell';
/** The sidebar is another view of notebook-owned conversations, not a second execution store. */
export function NotebookAgentChat() {
  const cells = useStore((state) => state.cells);
  const notebookId = useStore((state) => state.notebookId);
  const selected = useNotebookConversation((state) => state.selected[notebookId ?? '']);
  const select = useNotebookConversation((state) => state.select);
  const agents = cells.filter((cell) => cell.type === 'agent');
  if (!agents.length) return null;
  const current = agents.find((cell) => cell.id === selected) ?? agents[agents.length - 1];
  return (
    <section aria-label="Notebook Agent 聊天" className="av-theme">
      <AgentCell
        key={current.id}
        cellId={current.id}
        author={
          agents.length > 1 ? (
            <select
              aria-label="选择 Agent 会话"
              className="agent-message-author bg-transparent"
              value={current.id}
              onChange={(event) => notebookId && select(notebookId, event.target.value)}
            >
              {agents.map((cell, index) => (
                <option key={cell.id} value={cell.id}>
                  {cell.metadata?.agent?.provider === 'claude' ? '@ClaudeCodeAgent' : '@CodexAgent'}{' '}
                  · {index + 1}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
    </section>
  );
}
