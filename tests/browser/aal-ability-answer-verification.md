# AAL ability Host and cited answers — 2026-10-28

## Actual local execution

- Built `aal-agent-provider` against the canonical EasyNet provider SDK.
- Generated `/tmp/notebook-agent-ability-20261028-v2` with `notebook.agent` descriptor,
  measured binary and compiled AAL artifact. No plugin admission was fabricated.
- Native provider boundary tests invoked the packaged executable with explicit test
  invocation envelopes. Real AAL compiler/kernel, persistent journal and private
  Host socket executed. These envelopes are test inputs, not signed daemon calls.
- Tests passed: real result, durable replay without a repeated model call,
  waiting for tool decision, rejection returned to the model, cancellation.
- Two additional tests used actual Codex and Claude Code, with no fabricated
  model output: both streamed text and usage through the packaged AAL Host.
- Existing application packaging/replay/state-isolation tests: 2 passed.
- The generated EAL call compiled with the connection string unchanged. Actual
  mission execution stopped at the unavailable local daemon Invocation endpoint.

## Browser checks (actual models, seeded disposable notebook)

- Claude read `notes`, produced a real answer and source citation.
- Clicking the citation opened the exact read snapshot. Closing worked.
- Positive feedback persisted; opening details showed the same selected feedback
  and answer, rather than a separate copy of the conversation.
- Codex read `notes`, requested `update_cell` approval. The text stayed unchanged
  while waiting; execution tree displayed `Needs you` and timeline `waiting`.
- Approving changed the cell to `Verification note: verified through AAL.`;
  the tool and AAL kernel reached Done. Answer cited its actual read snapshot.
- These browser calls used the configured local AAL worker, not EasyNet dispatch.

## Pairing-dependent acceptance

Still requires a paired running daemon: installing/admitting the package,
calling it through EAL, native signed ledger streaming, remote cancel receipt,
and remote retry with a fresh invocation. The local notebook Host socket is
intentionally co-located with the notebook bridge; it is not a remotely exposed
model service. EAL can dispatch other remote abilities through its daemon.

## Answer component final behavior

Visual reference: https://www.affectui.com/components/ai-answer (public preview).
Original implementation using existing theme variables; no Pro source fetched.
Source cards come only from successful read_cell results and retain the actual
read snapshot. Citation chips preview that snapshot without navigation or layout
reflow. Related prompts derive from these source titles, not fabricated sources.
Feedback is persisted in the notebook turn (local feedback, not sent to a provider).
Regeneration retains history and sends an internal intent with the original
visible question. It is a real model request, not an animation replay.

Observed real Claude regeneration completed in 15.9s and read both cells again;
no mutations or code executions occurred. An attempted cancellation after that
completion found no cancel button, so it is not counted as a browser cancel test.
Cancellation was validated at the native provider/Host boundary separately.

Frontend full type-check still reports pre-existing errors outside the changed
answer/session files (including AgentVisuals.test role options, data-table and
stream action types). Backend type-check and focused session/answer tests pass.
