import type { AgentAction, AgentCellData, AgentTurn } from '@Services/agent-cell/protocol';
import type { AgentStatus, LaneAgent, LaneTask, TreeAgent } from '../../../AgentVisuals/model';
const statuses: Record<string, AgentStatus> = {
  idle: 'queued',
  running: 'running',
  cancelling: 'running',
  waiting: 'waiting',
  completed: 'done',
  failed: 'failed',
  cancelled: 'stopped',
  rejected: 'stopped',
};
export const agentActionStatus = (action: AgentAction, live: boolean): AgentStatus =>
  !live && ['running', 'waiting'].includes(action.status)
    ? 'stopped'
    : (statuses[action.status] ?? 'queued');
/** A projection of persisted events, never fabricated subagents, costs or model names. */
export function projectAgentRun(data: AgentCellData, turn: AgentTurn, live: boolean) {
  const name = data.provider === 'claude' ? 'Claude Code' : 'Codex';
  const pending = live && turn.actions.some((action) => action.status === 'waiting');
  const status: AgentStatus = pending
    ? 'waiting'
    : !live && ['running', 'cancelling'].includes(turn.status)
      ? 'stopped'
      : (statuses[turn.status] ?? 'queued');
  const children: TreeAgent[] = turn.actions.map((action) => ({
    id: action.id,
    name: action.name,
    task: action.kind === 'activity' ? 'Provider activity' : 'Notebook tool',
    status: agentActionStatus(action, live),
    started: action.startedAt,
    ended: action.endedAt,
    ask:
      action.status === 'waiting'
        ? `允许 ${action.name}？\n${JSON.stringify(action.arguments, null, 2)}`
        : undefined,
    error: action.status === 'failed' ? JSON.stringify(action.result, null, 2) : undefined,
  }));
  const root: TreeAgent = {
    id: turn.id,
    name,
    avatar: data.provider,
    status,
    task: turn.prompt,
    started: turn.startedAt,
    ended: turn.endedAt,
    error: turn.error,
    children,
  };
  const agents: LaneAgent[] = [{ id: turn.id, name, avatar: data.provider }];
  const tasks: LaneTask[] = turn.actions
    .filter((action) => action.startedAt !== undefined)
    .map((action) => ({
      id: action.id,
      agentId: turn.id,
      title: action.name,
      status: agentActionStatus(action, live),
      start: action.startedAt!,
      end: action.endedAt,
      ask:
        action.status === 'waiting'
          ? `允许 ${action.name}？\n${JSON.stringify(action.arguments, null, 2)}`
          : undefined,
      summary: JSON.stringify({ arguments: action.arguments, result: action.result }, null, 2),
    }));
  // The provider run remains visible while streaming before the first tool call.
  if (!tasks.length && turn.startedAt !== undefined)
    tasks.push({
      id: turn.id,
      agentId: turn.id,
      title: '生成回答',
      status,
      start: turn.startedAt,
      end: turn.endedAt,
      summary: turn.answer,
    });
  return { root, agents, tasks };
}
