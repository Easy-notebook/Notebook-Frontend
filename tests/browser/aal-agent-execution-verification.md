# AAL Agent Cell verification — 2026-10-28

## Actual executions

Browser page: `/tests/browser/agent-live.html`; seeded notebook content, real model/backend calls (no canned model responses).

- Claude Code through native AAL: list_cells/read_cell(notes), actual answer `Verification note: original.`, completed in 11s; UI reported 29,279 tokens.
- Codex through native AAL: list_cells/read_cell(notes), actual answer with the same original text, completed in 14s; UI reported 22,459 tokens.
- Final Claude run after adding tool span propagation: 9s, 29,262 tokens; expanded tree contained `NotebookAgent.run → skill.notebook_model → {list_cells, read_cell}`, all Done, with the actual per-run ID `0a3d0e1f-3b98-4690-81aa-cb4661d9b67f`.
- Opened details and the execution disclosure. Tree and timeline consumed the same stored spans as chat. Screenshots: `/tmp/aal-agent-real-trace.png`, `/tmp/aal-codex-trace.png`.
- Cancelled a real Claude long answer from the composer. Both AAL and model spans displayed Stopped; the composer became editable. `pgrep -x aal-agent-cell` found no worker process afterward. Screenshot `/tmp/aal-cancel-trace.png`. Missing terminal events are explicitly described as stopped observation, not proven remote cancellation.

## Automated checks

- Built actual native `aal-agent-cell` against the local AAL compiler/kernel.
- 7 server tests passed: 3 native-worker tests using an explicitly controlled model Host, 3 HTTP bridge tests, 1 EAL projection fixture test. These do not claim live model or distributed-runtime coverage.
- 13 frontend/session tests passed: span projection, immutable updates, session lifecycle and existing tool flows.
- `npm run agent:type-check`, native `cargo fmt --check`, and `git diff --check` passed.
- Actual installed `easynet mission compile` produced IR for the compile-only source `mission "notebook-compile-check" { let result = call "aal_notebook.read" on "test-device" }`. No target was contacted; `test-device` is not a claimed deployment.

## Unverified boundaries

No device was paired and no authority was changed. EAL daemon run, cancellation, live remote events and receipts have NOT been tested. EAL API supports CLI run records and archival trace retrieval, not streaming mission subscriptions. The local AAL worker is not yet an installed governed EasyNet ability. Frontend tracing must not be described as canonical Axon receipt verification. Notebook modification approvals were retained structurally and covered by existing session tests; this browser pass only exercised read tools and cancellation.
