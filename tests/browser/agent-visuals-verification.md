# Agent visuals verification — 2026-10-28

Page: `/tests/browser/agent-visuals.html`; sample data is explicitly labeled.
Verified with the browser UI (not direct store mutations):

- Dark and light themes; wide and 480px container layouts.
- Lane task click opens anchored details; Approve changes local waiting → running
  and increments running count. Escape closes and restores focus to task button.
- Tree branch collapse hides descendants while keeping aggregate counts/cost.
- Failed filter selects Tester; retry updates root input and restores the full
  tree when there are no failed tasks remaining.
- Writer approval updates waiting/running totals through the component callback.
- Notebook JSON editor: malformed input shows diagnostic without losing draft;
  applying valid replacement renders new node data; Cmd+Z restores prior source.
- Chat's View Details expands the embedded Markdown lane component fully.
- Agent Cell details show the actual fixture turn and expandable tool result.
  This run checks presentation; it does not claim a new live provider invocation.

Automated: document validation, timing/cost model, tree/lanes interactions, stale
source edit rejection, Lexical import/export, existing Markdown round trips,
chat component tests, AgentCellSession, NotebookAgentTools and Mermaid execution.

Screenshots: `/tmp/agent-details-reference-style.png`,
`/tmp/agent-components-reference-style.png`, `/tmp/agent-chat-reference-style.png`.
