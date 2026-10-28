# Agent visualizations

Independent implementation based on the public previews and documented inputs of
[Agent Lanes](https://www.affectui.com/components/agent-lanes) and
[Agent Tree](https://www.affectui.com/components/agent-tree). No gated source was used.

## Markdown authoring

Use a fenced `agent-tree` or `agent-lanes` block with JSON. The notebook renders
these as editable custom blocks; chat renders them through the same Markdown
renderer. Typing either opening fence followed by Enter inserts a starter block.
Edit source → Apply participates in notebook undo/redo. Invalid drafts and stale
edits never replace the current block.

````markdown
```agent-tree
{
  "title": "Agents",
  "root": {
    "id": "orchestrator",
    "name": "Orchestrator",
    "avatar": "claude",
    "model": "Claude Code",
    "task": "Inspect this notebook",
    "status": "running",
    "children": [
      { "id": "review", "name": "Reviewer", "avatar": "codex", "task": "Review results", "status": "queued" }
    ]
  }
}
```

```agent-lanes
{
  "now": 1800000000000,
  "span": 1800000,
  "agents": [{ "id": "research", "name": "Researcher", "avatar": "claude" }],
  "tasks": [{ "id": "read", "agentId": "research", "title": "Read notebook cells", "status": "running", "start": 1799999400000, "tools": ["notion", "github"] }]
}
```
````

Timestamps are epoch milliseconds. Omit `now` for a clock that advances while a
run is active. `handoffTo` references another task ID. Tree `cost` is each node's
own cost; branch totals include descendants once. Missing metrics stay absent.
JSON avatars/tools accept plain strings: `claude`, `codex`, `openai`, `gemini`,
`notion`, `slack`, `figma`, `github`, `stripe`, or a short textual mark. React callers
can also pass custom React nodes. JSON cannot inject HTML or executable actions.

## Live application integration

`AgentLanes` accepts `agents`, `tasks`, `span`, `now`, `title`, `className`,
`onApprove`, `onReject`, and `onOpen`. Without handlers lane decisions are local
preview state, reset when the source task object changes. They do not call agents.

`AgentTree` accepts `root`, controlled `collapsed` / `onCollapsedChange`,
`defaultCollapsed`, `onResolve`, `onSelect`, `now`, `formatCost`, `title`, and
`className`. `onResolve(agent, action)` receives approve/reject/retry/dismiss;
without a handler mutation buttons are disabled. The owner must feed updated
state back through `root`. Status filters reset to the full tree when no longer
applicable. Native dialogs handle Escape/focus containment/restoration.

Markdown is a data snapshot, not an authorization to execute tools. Actual
Codex/Claude actions remain owned by `agentCellService`. Agent Cell's details
panel reads its real turn/action records; visual components do not synthesize
costs, timestamps, or child agents from tool calls.

## Boundaries and cost

- `model`: typed view data, time clipping, one postorder branch aggregation O(N).
- `AgentVisualDocument`: bounded JSON validation and relationship checks O(N+T).
- `AgentTree` / `AgentLanes`: view interactions; no notebook/store/network imports.
- `AgentVisualization`: Markdown adapter and source editor.
- `AgentVisualizationNode`: Lexical serialization and atomic notebook edits.
- `shared` / `AgentMark` / CSS: theme, accessible overlays, status and identity.

Lane grouping and task/agent indexing are memoized; handoff rendering uses map
lookups rather than nested searches. One clock per view stops when no task runs.
The stylesheet scopes all component styles, supports both themes, narrow widths,
and reduced motion. No additional dependency was introduced.

## Live Codex / Claude Code execution

`AgentRunActivity` projects real `AgentTurn` / `AgentAction` records into both
views. It is shared by Agent Cell chat, notebook sidebar chat, and Agent details.
Tool calls remain tool steps, not invented subagents. New runs record wall-clock
start/end times; old records without timestamps do not get invented durations.

Notebook mutation tools (`update_cell`, `run_cell`, `curate_context`) now enter
`waiting` before execution. `AgentApprovalGate` consumes one scoped decision;
rejection sends `USER_REJECTED` to the provider without executing the tool.
Approval expires after four minutes. Execution first claims the live tool call
through `/agent-api/tool-start`; duplicate/expired/cancelled claims fail. Existing
version checks run after approval, so an intervening manual edit remains safe.

Cancel aborts the stream, provider process, pending decisions and any active code
execution. Retry is a new turn with `retryOf`, rereads current state, and asks for
new approvals instead of replaying old version tokens. Sidebar and details route
commands through the same notebook/cell/session/turn identity checks. Markdown
JSON snapshots still never execute provider actions.
