import { ExecutionTrace } from '../../../AgentVisuals/ExecutionTrace';
import { RenderDiagnostics } from '../../../AgentVisuals/RenderDiagnostics';
import { useState } from 'react';
import { AgentThinking, ActionPayload } from '../../../AgentVisuals/AgentThinking';
import { agentCellService, type AgentRunTarget } from '@Services/agent-cell/agentCellService';
import type { AgentCellData, AgentTurn } from '@Services/agent-cell/protocol';
export function AgentRunActivity({
  cellId,
  notebookId,
  data,
  turn,
  readOnly = false,
  showControls = true,
  collapseCompleted = false,
  controlsOnly = false,
}: {
  cellId: string;
  notebookId: string;
  data: AgentCellData;
  turn: AgentTurn;
  readOnly?: boolean;
  showControls?: boolean;
  collapseCompleted?: boolean;
  controlsOnly?: boolean;
}) {
  const [error, setError] = useState('');
  const sessionActive = agentCellService.isActive(notebookId, cellId);
  const live = data.turns[data.turns.length - 1]?.id === turn.id && sessionActive;
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
      {!controlsOnly && (
        <RenderDiagnostics name="agent-action-visual">
          <AgentThinking turn={turn} live={live} collapseCompleted={collapseCompleted} />
        </RenderDiagnostics>
      )}
      {!controlsOnly && !!turn.spans?.length && <ExecutionTrace spans={turn.spans} />}
      {!readOnly && ((live && showControls) || retryable) && (
        <div className="av-live-controls">
          {live && showControls && (
            <button type="button" onClick={cancel}>
              取消运行
            </button>
          )}
          {retryable && (
            <button type="button" onClick={retry}>
              重试此轮
            </button>
          )}
        </div>
      )}
      {!!pending.length && (
        <div className="av-approval-list">
          {pending.map((action) => (
            <section className="av-tree-card" key={action.id} aria-label={`审批 ${action.name}`}>
              <strong>等待审批 · {action.name}</strong>
              <ActionPayload value={action.arguments} />
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
