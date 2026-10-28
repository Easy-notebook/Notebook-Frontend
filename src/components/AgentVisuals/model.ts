import type { ReactNode } from 'react';
export type AgentStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped';
export interface LaneAgent {
  id: string;
  name: string;
  model?: string;
  avatar?: ReactNode;
}
export interface LaneTask {
  id: string;
  agentId: string;
  title: string;
  status: AgentStatus;
  start: number;
  end?: number;
  handoffTo?: string;
  ask?: string;
  summary?: string | string[];
  tools?: ReactNode[];
}
export interface TreeAgent extends LaneAgent {
  task: string;
  status: AgentStatus;
  ask?: string;
  error?: string;
  cost?: number;
  started?: number;
  ended?: number;
  tools?: ReactNode[];
  children?: TreeAgent[];
}
export const statusLabel: Record<AgentStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  waiting: 'Needs you',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};
export const dollars = (cost: number) => `$${cost.toFixed(2)}`;
export const duration = (start?: number, end?: number) => {
  if (start === undefined || end === undefined) return '';
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};
/** One postorder traversal, shared by every card and the header. Own costs are never double counted. */
export function indexTree(root: TreeAgent) {
  const totals = new Map<string, number>();
  const nodes: TreeAgent[] = [];
  const costed = new Set<string>();
  const visit = (node: TreeAgent): number => {
    if (totals.has(node.id)) throw new Error(`Duplicate agent id: ${node.id}`);
    totals.set(node.id, 0);
    nodes.push(node);
    const sum =
      (node.cost ?? 0) + (node.children ?? []).reduce((value, child) => value + visit(child), 0);
    if (node.cost !== undefined || node.children?.some((child) => costed.has(child.id)))
      costed.add(node.id);
    totals.set(node.id, sum);
    return sum;
  };
  visit(root);
  return { nodes, totals, costed };
}
export function laneGeometry(task: LaneTask, now: number, span: number) {
  const start = Math.max(now - span, task.start),
    end = Math.min(now, task.end ?? now);
  if (end <= now - span || start > now || end < start) return null;
  return {
    left: ((start - now + span) / span) * 100,
    width: Math.max(0.4, ((end - start) / span) * 100),
  };
}
