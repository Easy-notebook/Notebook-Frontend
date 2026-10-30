import { ReadingViewport } from '../../../AgentVisuals/ReadingViewport';
import { AgentAnswer } from './AgentAnswer';
import { AgentRunActivity } from './AgentRunActivity';
import { AgentDetails } from './AgentDetails';
import { AgentAvatar } from '../../../AgentVisuals/shared';
import { markdownCodeComponents } from '../../MarkdownCodePreview';
import './agent-cell.css';
import { FactCapture } from '../../NotebookContext/FactCapture';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Square, MessageSquarePlus, FileText, CircleHelp, Reply } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useStore from '@Store/notebookStore';
import { agentCellService } from '@Services/agent-cell/agentCellService';
import type { AgentCellData, AgentProvider } from '@Services/agent-cell/protocol';

export function AgentCell({
  cellId,
  readOnly = false,
  author,
}: {
  cellId: string;
  readOnly?: boolean;
  author?: ReactNode;
}) {
  const cell = useStore((state) => state.cells.find((item) => item.id === cellId));
  const notebookId = useStore((state) => state.notebookId);
  const data = cell?.metadata?.agent as AgentCellData | undefined;
  const sending = useRef(false);
  const composing = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(cell?.content || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const composerVisible = !data?.turns.length || replyOpen;
  const busy = pending || (!!notebookId && agentCellService.isActive(notebookId, cellId));
  const disabled = readOnly || cell?.enableEdit === false;
  const latestTurn = data?.turns[data.turns.length - 1];
  const attention = latestTurn?.actions.some((action) => action.status === 'waiting')
    ? '等待审批'
    : busy
      ? cancelling
        ? '正在取消'
        : '正在回答'
      : latestTurn?.status === 'failed'
        ? '未完成'
        : null;
  useEffect(() => {
    if (disabled && notebookId) agentCellService.cancel(notebookId, cellId);
  }, [disabled, notebookId, cellId]);
  useEffect(() => {
    const element = input.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${Math.min(180, element.scrollHeight)}px`;
    }
  }, [prompt, composerVisible]);
  useEffect(() => {
    if (replyOpen) input.current?.focus();
  }, [replyOpen]);
  const send = async (text: string) => {
    if (sending.current || disabled || busy || !notebookId || !text.trim()) return;
    sending.current = true;
    setPending(true);
    setError('');
    setCancelling(false);
    try {
      await agentCellService.send(cellId, text);
      setPrompt((current) => (current === text ? '' : current));
      setReplyOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      sending.current = false;
      setPending(false);
      setCancelling(false);
    }
  };
  return (
    <section
      className="agent-cell agent-message-callout av-theme my-4"
      data-provider={data?.provider || 'codex'}
      aria-label="Agent Cell"
      contentEditable={false}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="agent-cell-toolbar flex items-center gap-2 px-3 py-2">
        <AgentAvatar name={data?.provider === 'claude' ? 'Claude Code' : 'Codex'} />
        {author ??
          (data?.turns.length ? (
            <strong className="agent-message-author">
              {data.provider === 'claude' ? '@ClaudeCodeAgent' : '@CodexAgent'}
            </strong>
          ) : (
            <select
              aria-label="Agent provider"
              className="rounded border px-2 py-1 text-sm"
              value={data?.provider || 'codex'}
              disabled={disabled || busy || !!data?.turns.length}
              onChange={(event) =>
                agentCellService.configure(cellId, event.target.value as AgentProvider)
              }
            >
              <option value="codex">@CodexAgent</option>
              <option value="claude">@ClaudeCodeAgent</option>
            </select>
          ))}
        {attention && (
          <span className="agent-turn-description" role="status">
            {attention}
          </span>
        )}
        {!!data?.turns.length && (
          <button
            type="button"
            className="agent-toolbar-button ml-auto"
            aria-label="新会话"
            title="新会话"
            disabled={disabled || busy}
            onClick={() => agentCellService.configure(cellId, data.provider)}
          >
            <MessageSquarePlus size={15} />
          </button>
        )}
        {!disabled && !!data?.turns.length && (
          <button
            type="button"
            disabled={busy || !data?.turns.length}
            className="agent-toolbar-button agent-summary"
            aria-label="生成摘要"
            title="生成摘要"
            onClick={() =>
              void send(
                '请总结当前任务的目标、发现、cell 变更、执行证据与剩余工作，并调用 summary 工具保存摘要。'
              )
            }
          >
            <FileText size={15} />
          </button>
        )}
        <button
          type="button"
          className="agent-toolbar-button"
          aria-label="Agent 详情"
          title="详情与运行轨迹"
          onClick={() => setShowDetails(true)}
        >
          <CircleHelp size={15} />
        </button>
        {!disabled && !!data?.turns.length && (
          <button
            type="button"
            className="agent-toolbar-button"
            aria-label="回复"
            title="回复"
            aria-expanded={replyOpen}
            onClick={() => setReplyOpen((open) => !open)}
          >
            <Reply size={15} />
          </button>
        )}
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
        {!!data?.turns.length && (
          <ReadingViewport label="Agent 对话记录" className="agent-conversation-history">
            {data?.turns.map((turn) => (
              <article key={turn.id} className="agent-answer-card space-y-2">
                <div aria-label="用户需求" className="rounded border border-current/10 px-3 py-2">
                  <div className="mb-1 text-xs opacity-60">需求</div>
                  {turn.prompt.length > 400 ? (
                    <details>
                      <summary className="cursor-pointer text-sm">
                        {turn.prompt.slice(0, 100)}…
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{turn.prompt}</p>
                    </details>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{turn.prompt}</p>
                  )}
                </div>
                <AgentRunActivity
                  cellId={cellId}
                  notebookId={notebookId || ''}
                  data={data}
                  turn={turn}
                  controlsOnly
                  showControls={!composerVisible}
                  collapseCompleted
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
                    <AgentAnswer
                      text={turn.answer}
                      turn={turn}
                      disabled={disabled || busy}
                      onRegenerate={() =>
                        agentCellService.regenerate({
                          notebookId: notebookId || '',
                          cellId,
                          sessionId: data.sessionId,
                          turnId: turn.id,
                        })
                      }
                      onFollowUp={(question) => agentCellService.send(cellId, question)}
                    />
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
                  <ReactMarkdown components={markdownCodeComponents}>
                    {data.summary.text}
                  </ReactMarkdown>
                </div>
              </details>
            )}
          </ReadingViewport>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {!disabled && composerVisible && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(prompt);
            }}
            className="agent-composer"
          >
            <textarea
              rows={1}
              ref={input}
              aria-label="Agent prompt"
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !composing.current &&
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229
                ) {
                  event.preventDefault();
                  if (!event.repeat) void send(prompt);
                }
              }}
              className="agent-composer-input"
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                data?.turns.length ? '继续追问或安排下一步…' : '希望对当前 notebook 做什么？'
              }
            />
            <div className="agent-composer-actions">
              <button
                type="submit"
                aria-label="发送"
                title="发送 · Enter"
                disabled={busy || !prompt.trim() || !notebookId}
                className="agent-send"
              >
                <ArrowUp size={17} />
              </button>
              {busy && (
                <button
                  type="button"
                  disabled={cancelling}
                  className="agent-cancel"
                  onClick={() => {
                    if (notebookId) {
                      setCancelling(true);
                      agentCellService.cancel(notebookId, cellId);
                    }
                  }}
                >
                  <Square size={12} /> {cancelling ? '正在取消' : '取消'}
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
