import { AgentTurnHeading } from './AgentTurnHeading';
import { AgentAnswer } from './AgentAnswer';
import { agentCellService } from '@Services/agent-cell/agentCellService';
import { ReadingViewport } from '../../../AgentVisuals/ReadingViewport';
import { AgentDialog } from '../../../AgentVisuals/shared';
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
  return (
    <AgentDialog title="Agent 详情" close={close} variant="details">
      {data?.turns.length ? (
        <AgentTurnHeading provider={data.provider} turn={data.turns[data.turns.length - 1]} />
      ) : null}
      {data?.summary && <p className="av-task">{data.summary.text}</p>}
      <ReadingViewport label="Agent 详情记录" className="av-detail-history">
        {data?.turns.map((turn) => (
          <section key={turn.id} className="agent-answer-card">
            <p className="agent-answer-question">{turn.prompt}</p>
            <AgentRunActivity
              cellId={cellId}
              notebookId={notebookId}
              data={data}
              turn={turn}
              readOnly={readOnly}
            />
            {turn.answer && (
              <AgentAnswer
                text={turn.answer}
                turn={turn}
                disabled={readOnly || agentCellService.isActive(notebookId, cellId)}
                onRegenerate={() =>
                  agentCellService.regenerate({
                    notebookId,
                    cellId,
                    sessionId: data.sessionId,
                    turnId: turn.id,
                  })
                }
                onFollowUp={(question) => agentCellService.send(cellId, question)}
              />
            )}
            {turn.error && <p className="av-error">{turn.error}</p>}
          </section>
        ))}
      </ReadingViewport>
      {!data?.turns.length && <p className="av-muted">开始对话后显示实际行动和执行结果。</p>}
    </AgentDialog>
  );
}
