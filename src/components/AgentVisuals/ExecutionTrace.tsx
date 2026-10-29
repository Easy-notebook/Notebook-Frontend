import { useAgentClock } from './shared';
import { useMemo, useState } from 'react';
import { GitBranch, ChartGantt } from 'lucide-react';
import type { ExecutionSpan } from '../../services/agent-cell/protocol';
import type { TreeAgent, LaneTask } from './model';
import { AgentTree } from './AgentTree';
import { AgentLanes } from './AgentLanes';
/** Project observed identities and times; never infer children from action order. */
export function projectExecution(spans: ExecutionSpan[]) {
  const nodes = new Map<string, TreeAgent>();
  const indexed = new Map(spans.map((span) => [span.id, span]));
  if (indexed.size !== spans.length) throw new Error('Duplicate execution span');
  for (const span of spans)
    nodes.set(span.id, {
      id: span.id,
      name: span.name,
      model: span.runtime.toUpperCase(),
      task: span.invocation ?? span.name,
      status: span.status,
      started: span.startedAt,
      ended: span.endedAt,
      error: span.error,
      children: [],
    });
  const roots: TreeAgent[] = [];
  // Resolve ancestry once per span, including out-of-order delivery. O(V + E).
  const checked = new Set<string>();
  for (const span of spans) {
    const path = new Set<string>();
    let cursor: ExecutionSpan | undefined = span;
    while (cursor && !checked.has(cursor.id)) {
      if (path.has(cursor.id)) throw new Error('Cyclic execution trace');
      path.add(cursor.id);
      cursor = cursor.parentId ? indexed.get(cursor.parentId) : undefined;
    }
    for (const id of path) checked.add(id);
    const node = nodes.get(span.id)!;
    if (span.parentId && nodes.has(span.parentId)) nodes.get(span.parentId)!.children!.push(node);
    else roots.push(node);
  }
  const tasks: LaneTask[] = spans.map((span) => ({
    id: span.id,
    agentId: span.id,
    title: span.name,
    status: span.status,
    start: span.startedAt,
    end: span.endedAt,
    summary: span.error,
  }));
  return { roots, agents: [...nodes.values()], tasks };
}
export function ExecutionTrace({ spans }: { spans: ExecutionSpan[] }) {
  const [view, setView] = useState<'tree' | 'timeline'>('tree');
  const projection = useMemo(() => projectExecution(spans), [spans]);
  const live = spans.some((span) => ['queued', 'waiting', 'running'].includes(span.status));
  const clock = useAgentClock(undefined, live);
  const start = Math.min(...spans.map((span) => span.startedAt));
  const end = Math.max(...spans.map((span) => span.endedAt ?? clock));
  return (
    <details className="agent-execution-trace">
      <summary>
        运行轨迹
        <span className="agent-trace-switch" role="group" aria-label="轨迹视图">
          {(
            [
              { id: 'tree', label: '执行树', Icon: GitBranch },
              { id: 'timeline', label: '执行时间线', Icon: ChartGantt },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={view === id}
              onClick={(event) => {
                event.preventDefault();
                setView(id);
                const details = event.currentTarget.closest('details');
                if (details) details.open = true;
              }}
            >
              <Icon size={14} />
            </button>
          ))}
        </span>
      </summary>
      {view === 'tree' ? (
        projection.roots.map((root) => (
          <AgentTree
            key={root.id}
            root={root}
            compact
            title="执行树"
            itemLabel="calls"
            showHeader={false}
          />
        ))
      ) : (
        <AgentLanes
          agents={projection.agents}
          tasks={projection.tasks}
          title="执行时间线"
          showHeader={false}
          span={Math.max(1000, end - start + 1000)}
          now={spans.every((span) => span.endedAt !== undefined) ? end + 100 : undefined}
          readOnly
        />
      )}
    </details>
  );
}
