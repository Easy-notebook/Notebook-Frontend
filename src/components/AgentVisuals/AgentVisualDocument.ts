import { z } from 'zod';
import { indexTree, type TreeAgent } from './model';
export type AgentVisualKind = 'agent-lanes' | 'agent-tree';
export const isAgentVisualKind = (value: string): value is AgentVisualKind =>
  value === 'agent-lanes' || value === 'agent-tree';
const text = z.string().max(10000);
const identity = z.object({
  id: z.string().min(1).max(200),
  name: text,
  model: text.optional(),
  avatar: text.optional(),
});
const tools = z.array(text).max(20).optional();
const timestamp = z.number().finite().nonnegative();
const status = z.enum(['queued', 'running', 'waiting', 'done', 'failed', 'stopped']);
const agent = identity.extend({
  task: text,
  status,
  ask: text.optional(),
  error: text.optional(),
  cost: z.number().finite().nonnegative().optional(),
  started: timestamp.optional(),
  ended: timestamp.optional(),
  tools,
});
const treeSchema: z.ZodType<TreeAgent> = z.lazy(() =>
  agent.extend({ children: z.array(treeSchema).max(100).optional() })
);
const treeDocument = z.object({
  root: treeSchema,
  title: text.optional(),
  now: timestamp.optional(),
  collapsed: z.array(z.string()).optional(),
});
const lanesDocument = z.object({
  title: text.optional(),
  now: timestamp.optional(),
  span: z.number().finite().positive().optional(),
  agents: z.array(identity).min(1).max(100),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1),
        agentId: z.string(),
        title: text,
        status: z.enum(['running', 'waiting', 'done', 'failed']),
        start: timestamp,
        end: timestamp.optional(),
        handoffTo: z.string().optional(),
        ask: text.optional(),
        summary: z.union([text, z.array(text)]).optional(),
        tools,
      })
    )
    .max(1000),
});
export type AgentVisualDocument =
  | { kind: 'agent-tree'; data: z.infer<typeof treeDocument> }
  | { kind: 'agent-lanes'; data: z.infer<typeof lanesDocument> };
/** Bound recursion before schema traversal, then validate identity and graph references once. */
export function parseAgentVisual(kind: AgentVisualKind, source: string): AgentVisualDocument {
  if (source.length > 500000) throw new Error('Agent data must be smaller than 500 KB');
  const json = JSON.parse(source);
  const pending = [{ value: json, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++count > 20000 || depth > 32)
      throw new Error('Agent data exceeds the supported size or nesting depth');
    if (value && typeof value === 'object')
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
  }
  if (kind === 'agent-tree') {
    const data = treeDocument.parse(json);
    indexTree(data.root);
    return { kind, data };
  }
  const data = lanesDocument.parse(json);
  const agents = new Set(data.agents.map((item) => item.id)),
    tasks = new Set(data.tasks.map((item) => item.id));
  if (agents.size !== data.agents.length || tasks.size !== data.tasks.length)
    throw new Error('Agent and task IDs must be unique');
  for (const task of data.tasks) {
    if (!agents.has(task.agentId)) throw new Error(`Unknown agent: ${task.agentId}`);
    if (task.handoffTo && !tasks.has(task.handoffTo))
      throw new Error(`Unknown handoff task: ${task.handoffTo}`);
    if (task.end !== undefined && task.end < task.start)
      throw new Error(`Task ${task.id} ends before it starts`);
  }
  return { kind, data };
}
export function initialAgentVisualSource(kind: AgentVisualKind) {
  return JSON.stringify(
    kind === 'agent-tree'
      ? { root: { id: 'agent', name: 'Agent', task: 'Describe the task', status: 'queued' } }
      : { agents: [{ id: 'agent', name: 'Agent' }], tasks: [] },
    null,
    2
  );
}
