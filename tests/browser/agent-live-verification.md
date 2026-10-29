# Live Agent Cell verification — 2026-10-28

Browser: IAB, real `/agent-api/run` transport through the Vite bridge (no mocked provider responses).

## Provider checks

- Codex: read `notes` and `calculation`; changed only `return 2 + 3` to `return 7 * 8`; executed with the version returned by `update_cell`; AAL output `56`; persisted summary. Observed partial answer while status remained running.
- Codex follow-up recalled `cedar-56` and actual output `56`.
- Claude Code: read the same fixture cells in an independent browser session; changed only the return expression to `9 * 7`; executed with the new version; actual AAL output `63`; persisted summary. Observed growing partial text during a long answer.
- Claude follow-up recalled its own `maple-63` and output `63`.
- Both long-answer runs were cancelled through the visible Cancel button; status became `cancelled`, partial text remained, and the prompt became available again. Codex text was compared after subsequent Claude actions and remained unchanged.

## Fence entry and presentation

Type an opening fence as a standalone paragraph, then press Enter:

- ` ```agent:codex ` creates a Codex Agent Cell.
- ` ```agent:claude ` creates a Claude Code Agent Cell.

These are interactive creation shortcuts, not general Markdown import/export syntax. Each creation generates a new agent session. Source text is never executed automatically. AAL and Mermaid remain normal code languages; Agent execution retains its own session and tools lifecycle.

Browser verified both shortcuts select the requested provider and focus the prompt. Agent cells reuse the notebook's surface/ink/border variables and a compact header, with collapsed action records.

Targeted tests: AgentFence (2), AgentCellSession (4), NotebookAgentTools (7), all passed. Targeted ESLint passed. No production notebook was changed; edits/execution used the browser fixture.
