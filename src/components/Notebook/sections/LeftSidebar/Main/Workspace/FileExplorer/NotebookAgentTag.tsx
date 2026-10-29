import { NotebookAgentLogo } from '@Notebook/features/function-bar/NotebookAgentLogo';
import { useNotebookAgentIdentity } from '@Hooks/useNotebookAgentIdentity';
import { useAIAgentStore } from '@Store/AIAgentStore';

export function NotebookAgentTag({ notebookId }: { notebookId: string }) {
  const { identity, error } = useNotebookAgentIdentity(notebookId);
  return (
    <button
      className="explorer-agent-tag"
      disabled={!identity}
      title={
        identity
          ? `${identity.name} · ${identity.className} · 打开详情与 Terminal`
          : error || '正在读取 AAL Agent 身份'
      }
      aria-label={identity ? `打开 ${identity.name} 详情与 Terminal` : '正在读取 Agent 身份'}
      onClick={() => useAIAgentStore.getState().setShowCommandInput(true)}
    >
      <span className="explorer-agent-at" aria-hidden="true">
        @
      </span>
      {identity && <NotebookAgentLogo logo={identity.logo} />}
      <span className="explorer-agent-name">{identity?.name ?? (error ? '连接失败' : '…')}</span>
    </button>
  );
}
