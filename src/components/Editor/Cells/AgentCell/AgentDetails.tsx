import { AgentAvatar, AgentDialog } from '../../../AgentVisuals/shared';
import type { AgentCellData } from '@Services/agent-cell/protocol';
import { AgentRunActivity } from './AgentRunActivity';
export function AgentDetails({
  data,
  cellId,
  notebookId,
  readOnly,
  close,
}: {
  data?: AgentCellData;
  cellId: string;
  notebookId: string;
  readOnly?: boolean;
  close(): void;
}) {
  const name = data?.provider === 'claude' ? 'Claude Code' : 'Codex';
  return (
    <AgentDialog title="Agent 详情" close={close} variant="details">
      <div className="av-card-top">
        <AgentAvatar name={name} />
        <div className="av-identity">
          <strong>{name}</strong>
          <span className="av-muted">{data?.turns.length ?? 0} 轮对话</span>
        </div>
      </div>
      {data?.summary && <p className="av-task">{data.summary.text}</p>}
      <div className="av-detail-history">
        {data?.turns.map((turn, index) => (
          <section key={turn.id}>
            <p className="av-task">
              #{index + 1} · {turn.prompt}
            </p>
            <AgentRunActivity
              cellId={cellId}
              notebookId={notebookId}
              data={data}
              turn={turn}
              readOnly={readOnly}
            />
            <div className="av-live-answer" aria-live="polite">
              {turn.answer}
            </div>
            {turn.error && <p className="av-error">{turn.error}</p>}
          </section>
        ))}
      </div>
      {!data?.turns.length && <p className="av-muted">开始对话后显示实际行动和执行结果。</p>}
    </AgentDialog>
  );
}
