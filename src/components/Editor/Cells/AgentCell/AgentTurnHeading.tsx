import { AgentAvatar, useAgentClock } from '../../../AgentVisuals/shared';
import type { AgentProvider, AgentTurn } from '@Services/agent-cell/protocol';

export function AgentTurnHeading({ provider, turn }: { provider: AgentProvider; turn: AgentTurn }) {
  const name = provider === 'claude' ? 'Claude Code' : 'Codex';
  return (
    <header className="agent-turn-heading">
      <AgentAvatar name={name} />
      <strong>{name}</strong>
      <AgentTurnMeta turn={turn} />
    </header>
  );
}

/** Timing and lifecycle can share the cell toolbar without repeating identity. */
export function AgentTurnMeta({ turn }: { turn: AgentTurn }) {
  const active = turn.status === 'running' || turn.status === 'cancelling';
  const now = useAgentClock(turn.endedAt, active);
  return (
    <span className="agent-turn-meta">
      <span className="agent-turn-description">
        {active
          ? '正在回答'
          : turn.status === 'cancelled'
            ? '已取消'
            : turn.status === 'failed'
              ? '未完成'
              : '回答'}
      </span>
      {turn.startedAt !== undefined && (
        <time
          dateTime={new Date(turn.startedAt).toISOString()}
          title={new Date(turn.startedAt).toLocaleString()}
        >
          {new Date(turn.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {Math.max(0, (now - turn.startedAt) / 1000).toFixed(1)}s
        </time>
      )}
    </span>
  );
}
