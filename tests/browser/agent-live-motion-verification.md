# Real Agent motion verification — 2026-10-28

Browser: in-app browser, `/tests/browser/agent-live.html`. This page uses the real Codex / Claude transports and notebook tools, not the sample visual fixture.

## Observed calls

- Codex streamed its plan, read `notes`, requested `update_cell`. Expanded/collapsed the actual action tree during approval. Approval from details wrote `CODEX-MOTION-OK`; final answer and action result synchronized to chat.
- Claude streamed its plan, read `notes`, requested `CLAUDE-MOTION-OK`. Expanded/collapsed during approval, cancelled in details. Chat showed cancelled and notes stayed unchanged.
- After hot reload during regression development reset the isolated fixture, repeated calls on the final UI. Claude approved a `notes` update (test text `CODEX-MOTION-FINAL`, despite the provider being Claude); actual notebook text changed and turn completed.
- Codex requested `CANCELLED-MUST-NOT-WRITE`; inspected 2 actual tool steps with exactly 1 pending approval, folded/unfolded them, cancelled in chat, reopened details. Both showed stopped; pending update did not execute.

## Fixes from observation

- Anchored live details at 24px with a stable viewport height and internal scroll. DOM measurements before/after switching views and cancelling: top 24px, height 672px in a 720px viewport.
- Tool summary excludes the provider parent; one pending tool no longer displays two approvals.
- Live timeline header uses provider lifecycle status. Completed tools do not falsely imply the provider has stopped streaming.

Existing collapse/layout and timeline interpolation were exercised against real events. This is interaction and geometry validation, not a measured FPS benchmark; screenshots alone cannot establish frame pacing.

18 targeted component/projection/session tests passed. Screenshot: `/tmp/agent-real-motion-cancel.png`.
