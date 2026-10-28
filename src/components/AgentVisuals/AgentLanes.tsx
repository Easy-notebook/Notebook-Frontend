import { useMemo, useState } from 'react';
import {
  AgentAvatar,
  AgentDialog,
  AgentStatusBadge,
  Sparkles,
  ToolMarks,
  useAgentClock,
} from './shared';
import { laneGeometry, type AgentStatus, type LaneAgent, type LaneTask } from './model';
export interface AgentLanesProps {
  agents: LaneAgent[];
  tasks: LaneTask[];
  span?: number;
  now?: number;
  title?: string;
  className?: string;
  onApprove?(task: LaneTask): void;
  onReject?(task: LaneTask): void;
  onOpen?(task: LaneTask): void;
  onRetry?(task: LaneTask): void;
  onCancel?(task: LaneTask): void;
  readOnly?: boolean;
  executionStatus?: AgentStatus;
}
export function AgentLanes({
  agents,
  tasks,
  span = 1800000,
  now,
  title = 'Agents',
  className = '',
  onApprove,
  onReject,
  onOpen,
  onRetry,
  onCancel,
  readOnly = false,
  executionStatus,
}: AgentLanesProps) {
  const [anchor, setAnchor] = useState<HTMLElement>();
  const [selected, setSelected] = useState<string | null>(null);
  const resolved = tasks;
  const clock = useAgentClock(
    now,
    resolved.some((task) => ['running', 'waiting'].includes(task.status))
  );
  const windowSize = Math.max(1000, span);
  const running = resolved.filter((task) => task.status === 'running').length;
  const grouped = useMemo(() => {
    const result = new Map<string, LaneTask[]>();
    for (const task of resolved) {
      const row = result.get(task.agentId) ?? [];
      row.push(task);
      result.set(task.agentId, row);
    }
    return result;
  }, [resolved]);
  const taskIndex = useMemo(() => new Map(resolved.map((task) => [task.id, task])), [resolved]);
  const rowIndex = useMemo(
    () => new Map(agents.map((agent, index) => [agent.id, index])),
    [agents]
  );
  const current = resolved.find((task) => task.id === selected);
  const geometry = new Map(
    resolved.map((task) => [task.id, laneGeometry(task, clock, windowSize)])
  );
  const decide = (task: LaneTask, approve: boolean) => {
    const handler = approve ? onApprove : onReject;
    handler?.(task);
    setSelected(null);
  };
  return (
    <section className={`av-theme av-lanes ${className}`} aria-label={title}>
      <header className="av-bar">
        <Sparkles size={15} />
        <strong>{title}</strong>
        <span className="av-muted" aria-live="polite">
          {executionStatus ? (
            <AgentStatusBadge status={executionStatus} />
          ) : (
            <>
              <i className="av-dot" />
              {running} running
            </>
          )}
        </span>
        <span className="av-span">Last {Math.round(windowSize / 60000)}m</span>
      </header>
      <div className="av-lanes-body">
        <div className="av-axis">
          <span />
          {[5, 4, 3, 2, 1, 0].map((step) => (
            <span key={step}>
              {step ? (
                `−${windowSize < 360000 ? Math.round(((windowSize / 1000) * step) / 6) + 's' : Math.round(((windowSize / 60000) * step) / 6) + 'm'}`
              ) : (
                <b>now</b>
              )}
            </span>
          ))}
        </div>
        <div className="av-lane-rows">
          {agents.map((agent) => {
            const row = grouped.get(agent.id) ?? [];
            return (
              <div className="av-lane" key={agent.id}>
                <div className="av-lane-label">
                  <AgentAvatar name={agent.name} avatar={agent.avatar} />
                  <div>
                    <strong>{agent.name}</strong>
                    {!row.some((task) => task.status === 'running') && (
                      <small>
                        {row.some((task) => task.status === 'waiting') ? 'Needs you' : 'Idle'}
                      </small>
                    )}
                    <span className="av-muted">{agent.model}</span>
                  </div>
                </div>
                <div className="av-track" role="list" aria-label={`${agent.name} tasks`}>
                  {row.map((task) => {
                    const position = geometry.get(task.id);
                    return (
                      position && (
                        <div role="listitem" key={task.id}>
                          <button
                            className="av-task-bar"
                            data-status={task.status}
                            style={{ left: `${position.left}%`, width: `${position.width}%` }}
                            aria-label={`${agent.name}: ${task.title}, ${task.status}`}
                            onClick={(event) => {
                              setAnchor(event.currentTarget);
                              setSelected(task.id);
                            }}
                          >
                            <ToolMarks tools={task.tools} />
                            <span>{task.title}</span>
                          </button>
                        </div>
                      )
                    );
                  })}
                </div>
              </div>
            );
          })}
          <svg
            className="av-handoffs"
            aria-hidden="true"
            viewBox={`0 0 1000 ${agents.length * 54}`}
            preserveAspectRatio="none"
          >
            {resolved.map((task) => {
              if (!task.handoffTo) return null;
              const from = geometry.get(task.id),
                to = geometry.get(task.handoffTo);
              const next = taskIndex.get(task.handoffTo);
              if (!from || !to || !next) return null;
              const y1 = (rowIndex.get(task.agentId) ?? 0) * 54 + 27,
                y2 = (rowIndex.get(next.agentId) ?? 0) * 54 + 27;
              const x1 = (from.left + from.width) * 10,
                x2 = to.left * 10;
              return (
                <path
                  key={task.id}
                  d={`M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`}
                />
              );
            })}
          </svg>
        </div>
      </div>
      {current && (
        <AgentDialog anchor={anchor} title={current.title} close={() => setSelected(null)}>
          <AgentStatusBadge status={current.status} />
          <p>{current.ask}</p>
          {Array.isArray(current.summary) ? (
            <ul>
              {current.summary.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>{current.summary}</p>
          )}
          <div className="av-dialog-actions">
            {onCancel && ['running', 'waiting'].includes(current.status) && (
              <button
                onClick={() => {
                  onCancel(current);
                  setSelected(null);
                }}
              >
                取消运行
              </button>
            )}
            {onRetry && ['failed', 'stopped'].includes(current.status) && (
              <button
                onClick={() => {
                  onRetry(current);
                  setSelected(null);
                }}
              >
                重试
              </button>
            )}
            {current.status === 'waiting' ? (
              <>
                <button
                  disabled={readOnly || !onApprove}
                  data-dialog-primary
                  onClick={() => decide(current, true)}
                >
                  Approve
                </button>
                <button disabled={readOnly || !onReject} onClick={() => decide(current, false)}>
                  Reject
                </button>
              </>
            ) : (
              onOpen && <button onClick={() => onOpen(current)}>Open task</button>
            )}
          </div>
        </AgentDialog>
      )}
    </section>
  );
}
