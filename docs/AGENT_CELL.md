# Agent Cell

Insert **Agent Cell** from the editor's `/` menu. Choose Codex or Claude Agent, enter a request, and run. The cell shows streamed text and collapsible actions; subsequent requests continue the same provider session. **生成摘要** asks the agent to call the `summary` tool. **新会话** resets that cell's conversation and permits choosing another provider.

For durable selected facts, original purposes and a dedicated context curator, see [Notebook 上下文档案](NOTEBOOK_CONTEXT.md).

## Local development and preview

```sh
npm install
npm run dev
```

The Vite server hosts `/agent-api` on the same origin. `npm run preview` also installs the bridge. No extra development daemon is required. The browser does not receive provider credentials or provider thread IDs.

- Codex uses the project-pinned `@openai/codex` CLI through App Server. Authenticate with `npx codex login` before use. It uses the account's configured model. `NOTEBOOK_CODEX_BIN` can explicitly select another executable.
- Claude uses `@anthropic-ai/claude-agent-sdk`. Configure `ANTHROPIC_API_KEY` in the server environment (or another SDK-supported provider configuration). `NOTEBOOK_CLAUDE_BIN` optionally selects an executable. A third-party deployment must use supported API authentication; it must not assume customers' claude.ai subscription login can be reused.
- Provider errors appear in the cell and retain partial answers/actions. Failed requests can be followed up; they are never automatically retried as new executions.
- Save/open a notebook before running an agent so it has a stable identity.

For a separately served web build, start `npm run agent:bridge` (loopback port 8788, configurable with `NOTEBOOK_AGENT_PORT`) and proxy `/agent-api/` to it on the same local origin. The bridge deliberately requires a loopback host and same-origin requests. It is not a public multi-user service. The packaged Tauri application needs that same-origin bridge hosting arrangement; the Vite development integration alone does not package a Node runtime or daemon inside Tauri.

## Ownership and data

`AgentCell` is a view of persistent `cell.metadata.agent`. It owns no process. `AgentCellSession` owns one run, its abort signal, event reduction and tool dispatch. `NotebookAgentTools` owns live cell access/version checks and calls the existing notebook store's `updateCell`, `runSingleCell` and code store cancellation. Provider adapters share the same validated tool schemas.

- A conversation is bound to notebook ID, Agent Cell ID, provider and a random session ID. Each turn has a separate random run ID. The bridge verifies ownership and rejects overlapping turns.
- Every request supplies the full ordered cell index, current version tokens, bounded previews, the saved summary and recent conversation. Agents fetch full current content/outputs through `read_cell`; context is never limited to the visible viewport.
- `update_cell` and `run_cell` require the version returned by `read_cell` or `list_cells`. Version tokens change after content/type/language/editability changes, including edits reverted before a write. Deleted cells invalidate tokens. Outputs alone do not invalidate source versions.
- Tools only access the current notebook. Switching notebooks, replacing the conversation or removing its Agent Cell aborts its run. Late events cannot publish into the new owner.
- `run_cell` checks kernel activity before calling existing execution logic; it does not toggle/cancel an unrelated manual execution. Cancellation requests cancellation only for a cell execution started by this run. Existing backend cancellation limitations (including AAL worker deadlines) still apply. Cancellation never rolls back already applied changes.
- Actions have individual details and an overall fold. Summary stores agent-authored text, validated cell references and a timestamp. It does not delete conversation or silently compact the provider session.
- Conversation/action/summary data use the existing notebook persistence path. The bridge retains provider thread mapping in memory for up to 24 hours of inactivity. After bridge restart/expiry, the next turn starts a fresh provider session with the stored summary, recent conversation and live notebook index; complete provider-internal history is not restored.
- Refreshing/disconnecting terminates the active stream. Previously saved partial output is retained. A stale `running` record is shown as interrupted rather than implying that it is still active.

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `list_cells` | none | Current ordered cell index and versions |
| `read_cell` | `cellId` | Current content, outputs and version; agent cells expose saved summary |
| `update_cell` | `cellId`, `version`, `content` | Version-checked replacement of editable text/code content |
| `run_cell` | `cellId`, `version` | Version-checked execution through existing notebook kernel |
| `summary` | `text`, `cellIds` | Save findings, changes, evidence and next steps with valid references |

## Validation

```sh
npm run type-check
npm run agent:type-check
npm run agent:test
npx vitest run src/services/agent-cell src/components/Editor/extensions/AgentCellExtension.test.tsx
npx playwright test tests/browser/agent-cell.spec.js
npm run build
```

Optional live-provider tests use synthetic empty notebook data and incur provider usage:

```sh
npm run agent:smoke -- codex
npm run agent:smoke -- claude
```

References: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [Claude streaming](https://code.claude.com/docs/en/agent-sdk/streaming-output).
