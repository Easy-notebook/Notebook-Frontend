import { AgentSource } from './AgentSource';
import { useEffect, useState } from 'react';
import { openAgentDetails } from './agentDetailsSelection';
import { Bot, Terminal, Code2 } from 'lucide-react';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { useNotebookAgentIdentity } from '@Hooks/useNotebookAgentIdentity';
import {
  loadWorkspaceAgentIndex,
  type WorkspaceAgentIndex,
} from '@Services/agent-cell/WorkspaceAgentIndex';
import { NotebookAgentLogo } from '../function-bar/NotebookAgentLogo';
import { NotebookAgentProfile } from './NotebookAgentProfile';
import './workspace-agents.css';

function useIndex(notebookId: string) {
  const [state, setState] = useState<{ owner: string; data?: WorkspaceAgentIndex; error?: string }>(
    { owner: notebookId }
  );
  useEffect(() => {
    const controller = new AbortController();
    loadWorkspaceAgentIndex(notebookId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ owner: notebookId, data });
      },
      (error) => {
        if (!controller.signal.aborted) setState({ owner: notebookId, error: String(error) });
      }
    );
    return () => controller.abort();
  }, [notebookId]);
  return state.owner === notebookId ? state : { owner: notebookId };
}
export function WorkspaceAgentList({ notebookId }: { notebookId: string }) {
  const { data, error } = useIndex(notebookId);
  const { identity } = useNotebookAgentIdentity(notebookId);
  if (error)
    return (
      <p role="alert" className="wa-message">
        {error}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="wa-message">
        读取项目 Agent…
      </p>
    );
  const current = data.agents.find((a) => a.className === data.entry);
  const definitions = data.agents.filter((a) => a.className !== data.entry);
  return (
    <div className="wa-list">
      <h3>当前 Notebook</h3>
      {current && (
        <button className="wa-row" onClick={() => openAgentDetails(notebookId, current.className)}>
          {identity ? <NotebookAgentLogo logo={identity.logo} /> : <Bot size={18} />}
          <span>
            <strong>{identity?.name ?? current.className}</strong>
            <small>{current.className} · 实例</small>
          </span>
        </button>
      )}
      <h3>
        项目定义 <span>{definitions.length}</span>
      </h3>
      {definitions.map((agent) => (
        <button
          key={agent.className}
          className="wa-row"
          onClick={() => openAgentDetails(notebookId, agent.className)}
        >
          <Bot size={18} />
          <span>
            <strong>{agent.className}</strong>
            <small>{agent.contractOnly ? '契约' : `${agent.abilities.length} 个公开能力`}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
export function AgentDetails({ notebookId, className }: { notebookId: string; className: string }) {
  const [showSource, setShowSource] = useState(false);
  const { data, error } = useIndex(notebookId);
  const { identity } = useNotebookAgentIdentity(notebookId);
  const agent = data?.agents.find((a) => a.className === className);
  const current = data?.entry === className;
  return (
    <div className="wa-details">
      <div className="flex items-center justify-between gap-3">
        <h2>
          {current && identity ? (
            <>
              <NotebookAgentLogo logo={identity.logo} /> {identity.name}
            </>
          ) : (
            className
          )}
        </h2>
        <button
          type="button"
          className="wa-source-toggle"
          title={showSource ? '返回 Agent 详情' : '查看 AAL 源码'}
          aria-label="查看 AAL 源码"
          aria-pressed={showSource}
          onClick={() => setShowSource((value) => !value)}
        >
          <Code2 size={19} />
        </button>
      </div>
      <p className="wa-caption">
        {className} · {current ? 'Notebook 实例' : agent?.contractOnly ? '项目契约' : '项目定义'}
      </p>
      {showSource && <AgentSource notebookId={notebookId} className={className} />}
      <div hidden={showSource}>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">读取 AAL 定义…</p>}
        {data && !agent && <p role="alert">当前部署中没有这个 Agent 定义。</p>}
        {agent && (
          <>
            {agent.role && <p>{agent.role}</p>}
            {current ? (
              <>
                <button
                  className="wa-terminal"
                  onClick={() => {
                    useAIAgentStore.getState().setShowCommandInput(true);
                  }}
                >
                  <Terminal size={16} />
                  打开对话 Terminal
                </button>
                <NotebookAgentProfile notebookId={notebookId} />
              </>
            ) : (
              <p className="wa-caption">这是已部署 AAL 中的定义；此处不表示已创建运行实例。</p>
            )}
            <h3>
              公开能力 <span>{agent.abilities.length}</span>
            </h3>
            <div className="wa-abilities">
              {agent.abilities.map((a) => (
                <div key={a.name}>
                  <code>
                    {a.name}({a.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')}) →{' '}
                    {a.result}
                  </code>
                  {a.effects.length > 0 && <small>Effects: {a.effects.join(', ')}</small>}
                </div>
              ))}
            </div>
            <details>
              <summary>Memory 结构 · {agent.memory.length}</summary>
              {agent.memory.map((f) => (
                <p key={f.name}>
                  <code>
                    {f.name}: {f.type}
                  </code>
                </p>
              ))}
            </details>
            <details>
              <summary>Skills · {agent.skills.length}</summary>
              {agent.skills.length ? (
                agent.skills.map((s) => <p key={s}>{s}</p>)
              ) : (
                <p>未声明 Skill</p>
              )}
            </details>
            <details>
              <summary>权限声明</summary>
              <pre>
                {agent.permissions == null
                  ? '未显式声明；仍受 runtime 与宿主权限约束。'
                  : JSON.stringify(agent.permissions, null, 2)}
              </pre>
            </details>
            <p className="wa-caption">
              来源：当前项目部署的 AAL 编译产物 · 格式 v{data?.artifactVersion}。只展示声明，不读取
              memory 内容。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
