import { useNotebookAgentIdentity } from '@Hooks/useNotebookAgentIdentity';
import { openAgentDetails } from '../agents/agentDetailsSelection';
import { NotebookAgentLogo } from './NotebookAgentLogo';
export function TerminalAgentIdentity({ notebookId }: { notebookId: string }) {
  const { identity, error } = useNotebookAgentIdentity(notebookId);
  return (
    <div className="px-5 pt-3 text-xs text-slate-600 dark:text-slate-300">
      <button
        disabled={!identity}
        className="inline-flex items-center gap-1"
        onClick={() => identity && openAgentDetails(notebookId, identity.className)}
      >
        {identity ? (
          <>
            @ <NotebookAgentLogo logo={identity.logo} />
            {identity.name} · 查看详情
          </>
        ) : (
          error || '读取 Agent 身份…'
        )}
      </button>
    </div>
  );
}
