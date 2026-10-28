import { AgentAnswer } from './AgentAnswer';
import { AgentRunActivity } from './AgentRunActivity';
import { AgentDetails } from './AgentDetails';
import { AgentAvatar } from '../../../AgentVisuals/shared';
import { markdownCodeComponents } from '../../MarkdownCodePreview';
import './agent-cell.css';
import { FactCapture } from '../../NotebookContext/FactCapture';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import useStore from '@Store/notebookStore';
import { agentCellService } from '@Services/agent-cell/agentCellService';
import type { AgentCellData, AgentProvider } from '@Services/agent-cell/protocol';

export function AgentCell({ cellId, readOnly = false }: { cellId: string; readOnly?: boolean }) {
  const cell = useStore((state) => state.cells.find((item) => item.id === cellId));
  const notebookId = useStore((state) => state.notebookId);
  const data = cell?.metadata?.agent as AgentCellData | undefined;
  const [prompt, setPrompt] = useState(cell?.content || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const busy = pending || (!!notebookId && agentCellService.isActive(notebookId, cellId));
  const disabled = readOnly || cell?.enableEdit === false;
  useEffect(() => {
    if (disabled && notebookId) agentCellService.cancel(notebookId, cellId);
  }, [disabled, notebookId, cellId]);
  const send = async (text: string) => {
    if (disabled || busy || !text.trim()) return;
    setPending(true);
    setError('');
    setCancelling(false);
    try {
      await agentCellService.send(cellId, text);
      setPrompt((current) => (current === text ? '' : current));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
      setCancelling(false);
    }
  };
  return (
    <section
      className="agent-cell av-theme my-4 rounded-xl border shadow-sm"
      aria-label="Agent Cell"
      contentEditable={false}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <AgentAvatar name={data?.provider === 'claude' ? 'Claude Code' : 'Codex'} />
        <select
          aria-label="Agent provider"
          className="rounded border px-2 py-1 text-sm"
          value={data?.provider || 'codex'}
          disabled={disabled || busy || !!data?.turns.length}
          onChange={(event) =>
            agentCellService.configure(cellId, event.target.value as AgentProvider)
          }
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
        </select>
        {busy && (
          <span className="text-xs text-slate-500" role="status">
            {cancelling ? '正在取消' : '运行中'}
          </span>
        )}
        {!!data?.turns.length && (
          <button
            type="button"
            className="ml-auto text-xs"
            disabled={disabled || busy}
            onClick={() => agentCellService.configure(cellId, data.provider)}
          >
            新会话
          </button>
        )}
        <button type="button" className="text-xs" onClick={() => setShowDetails(true)}>
          Agent 详情
        </button>
      </header>
      {showDetails && (
        <AgentDetails
          data={data}
          cellId={cellId}
          notebookId={notebookId || ''}
          readOnly={disabled}
          close={() => setShowDetails(false)}
        />
      )}
      <div className="space-y-3 px-3 py-2">
        {data?.turns.map((turn) => (
          <article key={turn.id} className="space-y-2">
            <FactCapture
              source={{
                notebookId: notebookId || '',
                cellId,
                conversationId: data.sessionId,
                messageId: turn.id,
                role: 'user',
              }}
              disabled={disabled || !notebookId}
            >
              <p className="whitespace-pre-wrap rounded bg-slate-100 px-3 py-2 text-sm">
                {turn.prompt}
              </p>
            </FactCapture>
            <AgentRunActivity
              cellId={cellId}
              notebookId={notebookId || ''}
              data={data}
              turn={turn}
              readOnly={disabled}
            />
            {turn.answer && (
              <FactCapture
                source={{
                  notebookId: notebookId || '',
                  cellId,
                  conversationId: data.sessionId,
                  messageId: turn.id,
                  role: 'assistant',
                }}
                disabled={disabled || !notebookId}
              >
                <AgentAnswer text={turn.answer} />
              </FactCapture>
            )}
            {turn.status === 'running' && !busy && (
              <p role="status" className="text-xs text-slate-500">
                连接已中断，可继续追问
              </p>
            )}
            {turn.error && (
              <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">
                {turn.error}
              </p>
            )}
          </article>
        ))}
        {data?.summary && (
          <details open className="rounded bg-blue-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium">任务摘要</summary>
            <div className="prose prose-sm mt-2 max-w-none">
              <ReactMarkdown components={markdownCodeComponents}>{data.summary.text}</ReactMarkdown>
            </div>
          </details>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {!disabled && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(prompt);
            }}
            className="space-y-2"
          >
            <textarea
              aria-label="Agent prompt"
              className="min-h-20 w-full resize-y rounded border p-2 text-sm"
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                data?.turns.length ? '继续追问或安排下一步…' : '希望对当前 notebook 做什么？'
              }
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !prompt.trim() || !notebookId}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
              >
                {data?.turns.length ? '继续' : '运行'}
              </button>
              <button
                type="button"
                disabled={busy || !data?.turns.length}
                className="text-sm underline disabled:opacity-40"
                onClick={() =>
                  void send(
                    '请总结当前任务的目标、发现、cell 变更、执行证据与剩余工作，并调用 summary 工具保存摘要。'
                  )
                }
              >
                生成摘要
              </button>
              {busy && (
                <button
                  type="button"
                  disabled={cancelling}
                  className="ml-auto text-sm text-red-700"
                  onClick={() => {
                    if (notebookId) {
                      setCancelling(true);
                      agentCellService.cancel(notebookId, cellId);
                    }
                  }}
                >
                  取消
                </button>
              )}
            </div>
            {!notebookId && <p className="text-xs text-slate-500">请先打开或保存 notebook。</p>}
          </form>
        )}
      </div>
    </section>
  );
}
