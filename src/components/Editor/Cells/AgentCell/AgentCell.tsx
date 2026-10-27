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
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
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
      className="my-4 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm"
      aria-label="Agent Cell"
      contentEditable={false}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <strong className="text-sm">
          {data?.role === 'curator' ? '上下文整理 Agent' : 'Agent'}
        </strong>
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
          <option value="claude">Claude Agent</option>
        </select>
        <span className="text-xs text-slate-500">
          当前 notebook · {cancelling ? '正在取消' : busy ? '运行中' : '就绪'}
        </span>
        <button
          type="button"
          className="ml-auto text-xs underline"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '折叠全部行动' : '展开全部行动'}
        </button>
        {!!data?.turns.length && (
          <button
            type="button"
            className="text-xs underline"
            disabled={disabled || busy}
            onClick={() => agentCellService.configure(cellId, data.provider)}
          >
            新会话
          </button>
        )}
      </header>
      <div className="space-y-4 px-4 py-3">
        {!data?.turns.length && (
          <p className="text-sm text-slate-500">
            结合当前 cell 列表提问，或让 agent 修改、运行代码。行动和结果会保留在这里。
          </p>
        )}
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
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{turn.answer}</ReactMarkdown>
                </div>
              </FactCapture>
            )}
            {!!turn.actions.length && (
              <details
                key={`${turn.id}-${expanded}`}
                open={expanded}
                className="rounded border border-slate-200 text-sm"
              >
                <summary className="cursor-pointer px-3 py-2">
                  行动记录 · {turn.actions.length}
                </summary>
                <ol className="space-y-2 px-3 pb-3">
                  {turn.actions.map((action) => (
                    <li key={action.id}>
                      <details>
                        <summary className="cursor-pointer font-mono text-xs">
                          {action.name} · {action.status}
                        </summary>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs">
                          {JSON.stringify(
                            { arguments: action.arguments, result: action.result },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <p className="text-xs text-slate-500">
              {turn.status === 'running' && !busy ? '连接已中断，可继续追问' : turn.status}
            </p>
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
              <ReactMarkdown>{data.summary.text}</ReactMarkdown>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              相关 cells：{data.summary.cellIds.join(', ') || '无'}
            </p>
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
