import { RenderDiagnostics } from '../../../AgentVisuals/RenderDiagnostics';
import { useMemo, useState } from 'react';
import { AgentLanes } from '../../../AgentVisuals/AgentLanes';
import { AgentTree } from '../../../AgentVisuals/AgentTree';
import { projectAgentRun } from './AgentRunProjection';
import { agentCellService, type AgentRunTarget } from '@Services/agent-cell/agentCellService';
import type { AgentCellData, AgentTurn } from '@Services/agent-cell/protocol';
export function AgentRunActivity({
  cellId,
  notebookId,
  data,
  turn,
  readOnly = false,
}: {
  cellId: string;
  notebookId: string;
  data: AgentCellData;
  turn: AgentTurn;
  readOnly?: boolean;
}) {
  const [view, setView] = useState<'lanes' | 'tree'>('lanes');
  const [error, setError] = useState('');
  const sessionActive = agentCellService.isActive(notebookId, cellId);
  const live = data.turns[data.turns.length - 1]?.id === turn.id && sessionActive;
  const projection = useMemo(
    () => projectAgentRun(data, turn, live),
    [
      data.provider,
      turn.id,
      turn.prompt,
      turn.status,
      turn.error,
      turn.startedAt,
      turn.endedAt,
      turn.actions,
      live,
      turn.actions.length ? '' : turn.answer,
    ]
  );
  const target: AgentRunTarget = { notebookId, cellId, sessionId: data.sessionId, turnId: turn.id };
  const perform = (action: () => void | Promise<void>) => {
    setError('');
    try {
      void Promise.resolve(action()).catch((failure) => setError(String(failure)));
    } catch (failure) {
      setError(String(failure));
    }
  };
  const resolve = (id: string, decision: 'approve' | 'reject') =>
    perform(() => {
      if (readOnly || !live) throw new Error('This run is not editable or is no longer active');
      const call =
        turn.actions.find((action) => action.id === id && action.status === 'waiting') ??
        (id === turn.id ? turn.actions.find((action) => action.status === 'waiting') : undefined);
      if (!call) throw new Error('This approval is no longer active');
      agentCellService.resolve(target, call.id, decision);
    });
  const retry = () => perform(() => agentCellService.retry(target));
  const cancel = () => perform(() => agentCellService.cancelRun(target));
  const retryable =
    !sessionActive &&
    (['failed', 'cancelled'].includes(turn.status) ||
      turn.actions.some((action) => action.status === 'failed'));
  const pending = live ? turn.actions.filter((action) => action.status === 'waiting') : [];
  return (
    <section className="av-theme av-live-run" aria-label="实时 Agent 行动">
      <nav className="av-live-controls" aria-label="行动视图">
        <button type="button" aria-pressed={view === 'lanes'} onClick={() => setView('lanes')}>
          时间线
        </button>
        <button type="button" aria-pressed={view === 'tree'} onClick={() => setView('tree')}>
          行动树
        </button>
        {!readOnly && live && (
          <button type="button" onClick={cancel}>
            取消运行
          </button>
        )}
        {!readOnly && retryable && (
          <button type="button" onClick={retry}>
            重试此轮
          </button>
        )}
      </nav>
      <RenderDiagnostics name="agent-action-visual">
        {view === 'lanes' ? (
          <AgentLanes
            {...projection}
            title="执行时间线"
            executionStatus={projection.root.status}
            span={Math.max(
              60000,
              Math.min(
                1800000,
                (turn.endedAt ?? Date.now()) - (turn.startedAt ?? Date.now()) + 15000
              )
            )}
            now={live ? undefined : (turn.endedAt ?? turn.startedAt)}
            readOnly={readOnly || !live}
            onApprove={(task) => resolve(task.id, 'approve')}
            onReject={(task) => resolve(task.id, 'reject')}
            onRetry={!readOnly && retryable ? retry : undefined}
            onCancel={!readOnly && live ? cancel : undefined}
          />
        ) : (
          <AgentTree
            root={projection.root}
            title="执行行动"
            itemLabel="步骤"
            summarizeChildren
            hideDismiss
            now={live ? undefined : (turn.endedAt ?? turn.startedAt)}
            onResolve={
              readOnly
                ? undefined
                : (agent, action) => {
                    if (action === 'retry') retry();
                    else if (action === 'approve' || action === 'reject') resolve(agent.id, action);
                  }
            }
            onCancel={!readOnly && live ? cancel : undefined}
            renderDetails={(agent) => {
              const action = turn.actions.find((action) => action.id === agent.id);
              return action ? (
                <pre className="av-live-payload">
                  {JSON.stringify({ arguments: action.arguments, result: action.result }, null, 2)}
                </pre>
              ) : (
                <p>{turn.answer}</p>
              );
            }}
          />
        )}
      </RenderDiagnostics>
      {!!pending.length && (
        <div className="av-approval-list">
          {pending.map((action) => (
            <section className="av-tree-card" key={action.id} aria-label={`审批 ${action.name}`}>
              <strong>等待审批 · {action.name}</strong>
              <pre className="av-live-payload">{JSON.stringify(action.arguments, null, 2)}</pre>
              <div className="av-dialog-actions">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => resolve(action.id, 'approve')}
                >
                  批准 {action.name}
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => resolve(action.id, 'reject')}
                >
                  拒绝 {action.name}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="av-error">
          {error}
        </p>
      )}
    </section>
  );
}
