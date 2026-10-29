import { ReadingViewport } from './ReadingViewport';
import { memo, useId, useMemo, useState } from 'react';
import { Check, ChevronDown, Circle, Clock3, Code2, TriangleAlert } from 'lucide-react';
import type { AgentAction, AgentTurn } from '@Services/agent-cell/protocol';
import { useAgentClock } from './shared';
import './agent-thinking.css';

export function formatActionPayload(value: unknown): { text: string; valid: boolean } {
  if (typeof value === 'string') {
    try {
      return { text: JSON.stringify(JSON.parse(value), null, 2), valid: true };
    } catch {
      return { text: value, valid: false };
    }
  }
  try {
    return { text: JSON.stringify(value, null, 2) ?? 'null', valid: true };
  } catch {
    return { text: String(value), valid: false };
  }
}

/** Parse once on expansion; render tokens as text, never HTML or executable source. */
export const ActionPayload = memo(function ActionPayload({ value }: { value: unknown }) {
  const parsed = useMemo(() => formatActionPayload(value), [value]);
  const tokens = useMemo(
    () =>
      parsed.valid
        ? parsed.text.split(
            /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
          )
        : [parsed.text],
    [parsed]
  );
  return (
    <pre className="at-json" aria-label={parsed.valid ? 'JSON' : '原始文本'}>
      <code>
        {tokens.map((token, i) => {
          const kind = !parsed.valid
            ? ''
            : token.startsWith('"')
              ? token.trimEnd().endsWith(':')
                ? 'key'
                : 'string'
              : /^(true|false|null)$/.test(token)
                ? 'literal'
                : /^-?\d/.test(token)
                  ? 'number'
                  : '';
          return (
            <span key={i} className={kind ? `at-json-${kind}` : undefined}>
              {token}
            </span>
          );
        })}
      </code>
    </pre>
  );
});

const labels: Record<string, string> = {
  list_cells: '查看 Notebook',
  read_cell: '读取 Cell',
  update_cell: '修改 Cell',
  run_cell: '运行 Cell',
  read_context: '读取上下文',
  curate_context: '整理上下文',
  summary: '保存摘要',
};
const stateLabels: Record<string, string> = {
  running: '执行中',
  waiting: '等待审批',
  completed: '已完成',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
  stopped: '已停止',
};
const ActionStep = memo(function ActionStep({
  action,
  concealed,
}: {
  action: AgentAction;
  concealed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const payloadId = useId();
  const hasPayload = action.arguments !== undefined || action.result !== undefined;
  const target =
    action.arguments && typeof action.arguments === 'object' && 'cellId' in action.arguments
      ? String(action.arguments.cellId)
      : undefined;
  const Icon =
    action.status === 'failed'
      ? TriangleAlert
      : action.status === 'waiting'
        ? Clock3
        : action.status === 'completed' || action.status === 'done'
          ? Check
          : Circle;
  return (
    <li
      className="at-step"
      data-state={action.status}
      hidden={concealed && !open}
      data-action-id={action.id}
    >
      <span className="at-node" aria-hidden="true">
        <Icon size={14} />
      </span>
      <div className="at-step-content">
        <button
          type="button"
          className="at-step-title"
          disabled={!hasPayload}
          aria-expanded={hasPayload ? open : undefined}
          aria-controls={hasPayload ? payloadId : undefined}
          onClick={() => setOpen(!open)}
        >
          {labels[action.name] || action.name}
          <span className="at-step-status">{stateLabels[action.status] || action.status}</span>
          {hasPayload && (
            <ChevronDown size={13} className={open ? 'at-chevron is-open' : 'at-chevron'} />
          )}
        </button>
        {target && (
          <span className="at-chip">
            <Code2 size={13} />
            {target}
          </span>
        )}
        {open && (
          <div id={payloadId} className="at-payload">
            {action.arguments !== undefined && (
              <>
                <span className="at-payload-label">参数</span>
                <ActionPayload value={action.arguments} />
              </>
            )}
            {action.result !== undefined && (
              <>
                <span className="at-payload-label">结果</span>
                <ActionPayload value={action.result} />
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
});

/** Execution evidence only: no synthetic thoughts, sources or timed demo steps. */
export function AgentThinking({
  turn,
  live,
  collapseCompleted = false,
}: {
  turn: AgentTurn;
  live: boolean;
  collapseCompleted?: boolean;
}) {
  const phase = live ? 'live' : turn.status;
  const [disclosure, setDisclosure] = useState<{ phase: string; open: boolean } | null>(null);
  const expanded =
    disclosure?.phase === phase ? disclosure.open : !(collapseCompleted && phase === 'completed');
  const [all, setAll] = useState(false);
  const listId = useId();
  const now = useAgentClock(turn.endedAt, live);
  const seconds = turn.startedAt
    ? Math.max(0, Math.floor(((turn.endedAt ?? now) - turn.startedAt) / 1000))
    : 0;
  const title = live
    ? turn.status === 'cancelling'
      ? 'Cancelling'
      : turn.actions.some((action) => action.status === 'waiting')
        ? 'Waiting for approval'
        : 'Thinking'
    : turn.status === 'completed'
      ? 'Worked for'
      : turn.status === 'failed'
        ? 'Failed after'
        : turn.status === 'cancelled'
          ? 'Cancelled after'
          : 'Disconnected after';
  return (
    <section className="at-panel" aria-label="Agent 执行过程" data-active={live}>
      <button
        type="button"
        className="at-header"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setDisclosure({ phase, open: !expanded })}
      >
        <span className="at-pixels" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </span>
        <span className="at-title">{title}</span>
        <span className="at-time">{seconds}s</span>
        {turn.usage && (
          <span
            className="at-time"
            title={`输入 ${turn.usage.inputTokens} · 输出 ${turn.usage.outputTokens}`}
          >
            · {(turn.usage.inputTokens + turn.usage.outputTokens).toLocaleString()} tokens
          </span>
        )}
        <ChevronDown size={16} className={expanded ? 'at-chevron is-open' : 'at-chevron'} />
      </button>
      <div
        className="at-collapse"
        data-open={expanded}
        aria-hidden={!expanded}
        {...(!expanded ? { inert: '' } : {})}
      >
        <div className="at-clip">
          <div id={listId} className="at-body">
            {turn.actions.length > 4 && (
              <button
                type="button"
                className="at-more"
                aria-expanded={all}
                onClick={() => setAll(!all)}
              >
                {all ? '收起更多行动' : `+${turn.actions.length - 4} more`}
              </button>
            )}
            <ReadingViewport label="Agent 行动记录" className="at-action-scroll">
              <ol className="at-steps" aria-label="行动步骤">
                {turn.actions.map((action, index) => (
                  <ActionStep key={action.id} action={action} concealed={!all && index >= 4} />
                ))}
              </ol>
            </ReadingViewport>
            {!turn.actions.length && (
              <p className="at-empty">{live ? '正在生成回答' : '本轮未调用工具'}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
