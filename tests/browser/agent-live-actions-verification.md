# Real provider verification — 2026-10-28

UI: `/tests/browser/agent-live.html`. This is an isolated notebook with real
`/agent-api` requests to Codex app-server and Claude Code SDK and the running AAL
notebook backend. No provider responses or tool results are mocked.

## Browser observations

- Codex: partial answer appeared before completion; `read_cell` appeared in the
  timeline; `update_cell` paused for approval with code still `2 + 3`.
- Approved through the task-bar popover, then approved `run_cell` through Agent
  details. Actual AAL output: **42** (`6 * 7`).
- Claude Code, concurrently in a different Agent Cell: requested a notes mutation.
  Rejected it through chat; provider reported `USER_REJECTED`; original notes
  remained unchanged. No cross-session approval or message changes were observed.
- Claude Code follow-up: cancellation from details during approval did not write.
  Retry created a new turn, read the existing `6 * 7` code, requested approval
  again, then changed/reran it as `9 * 7`. Actual output: **63**.
- Codex cancellation similarly left notes unchanged. Retry requested a fresh
  version. Manually edited notes while approval was pending: old request returned
  `VERSION_CONFLICT`; the model read again and requested approval again.
- This uncovered a Lexical stale-selection defect during external text subtree
  replacement. Fixed by suspending/restoring selection around authored external
  updates, retaining unaffected live keys and bounded offsets in replaced cells.
- Repeated the conflict workflow after that fix: final approved notes became
  **CODEX-FINAL-OK** and the turn completed. No stale-node failure recurred.
- Repeated Codex cancel → retry → approve on the fixed version: notes became
  **CODEX-RETRY-FINAL**. Repeated Claude modify → approve → run → approve:
  actual output **63**. Both views observe the same persisted turn/action events.

Screenshots in `/tmp`: `codex-real-agent-42.png`, `live-agent-version-conflict.png`,
`live-agents-final.png`. Earlier intermediate screenshots are not completion
proof for the subsequently fixed selection problem.

## Automated checks

Session tests cover approval consumption exactly once, reject/cancel/notebook
switch without mutation, expired bridge claims, version conflicts, stream
retention, conversation continuity and late-event isolation. Bridge tests use
real HTTP and assert tool claims cannot be duplicated or moved to another run.
Projection tests verify real timestamps/identities and disable persisted approvals
when there is no live run. Lexical regression verifies repeated external updates
leave a valid selected node and bounded caret offset. Existing writing, Mermaid,
and agent-tool tests remain part of regression coverage.
