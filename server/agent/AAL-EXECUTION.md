# Notebook Agent execution

## Local AAL (implemented)

The default AgentBridge dispatches both model choices through `AalRuntime`. There is no direct-provider fallback. Build the companion worker in the Agent-Assembly-Language repository:

```sh
cargo build --locked --manifest-path /path/to/Agent-Assembly-Language/demos/agent-cell/Cargo.toml
```

Set `AAL_AGENT_WORKER` to the resulting `demos/agent-cell/target/debug/aal-agent-cell` executable in `.env.local` for Vite, or the server process environment for `npm run agent:bridge`. Restart Vite after changing the value.

Both model choices execute the Notebook-owned source `server/agent/aal/notebook.aal`. The source imports the standard `server/agent/skills/notebook/SKILL.md` package with `use skill "notebook" from path "../skills/notebook"`. `CodexAgent` inherits this skill from `NotebookAgent`; the bridge selects the model transport. The worker uses the actual `compile_file`, then creates a notebook-scoped instance factory, publishes the agent instance and calls `invoke_instance`. Only native completion succeeds.

The compiler validates and freezes the skill resource. `skill.notebook` Host metadata carries its hash, full document, parsed instructions and declared tools. `NotebookSkill.ts` checks deployment consistency; model tools are the intersection of skill declarations and worker/curator role grants. Both dynamic tools and MCP use this catalog. `NotebookModelHost` checks the same catalog before dispatch. There is no separate TypeScript copy of the skill instructions or direct-model fallback.

Notebook still owns approval, cell version checks, writing reservations, insertion resolution, code execution and persistence. The imported skill explains how to use these tools; it does not grant shell/filesystem access or move notebook state into the AAL kernel.

Local instances use per-invocation MemoryStore. Notebook/agent identity is bound when constructing the instance, but runtime state is not durable across worker exits; provider conversation continuity stays in the existing server session. Cancellation aborts the model Host and native worker. This is not network deployment or a distributed receipt.

## EAL interface (implemented; distributed execution not verified)

`EalMissionClient` uses the installed CLI, without invoking a shell or reproducing signing/dispatch. Same-origin POST endpoints:

- `/agent-api/eal/compile`: `{source}` → local compiler IR text; no daemon required.
- `/agent-api/eal/run`: `{source}` → daemon-owned mission run record.
- `/agent-api/eal/trace`: `{runId}` → version-1 trace document and display spans.
- `/agent-api/eal/cancel`: `{runId}` → CLI cancellation result.

Browser client: `EalOrchestration`. The run call returns when the CLI returns; it is not a live EAL event subscription. HTTP abort or killing a CLI observer is not daemon cancellation. The cancellation endpoint needs an actual daemon-assigned run ID and does not assert that remote effects were reversed. No automatic mission is generated from model prose; no default device or governed AAL ability is invented. Publishing the Agent model Host as an EasyNet provider and configuring its authority binding remain deployment work.

Trace projection preserves runtime IDs, parent IDs and observed start/end times. EAL steps are children of the mission, not a fabricated causal chain between siblings. Canonical invocation/receipt evidence remains in the returned original trace document. Schema mismatch fails explicitly; omitted/truncated trace history is not fabricated. EAL trace retrieval currently returns completed archival traces, not live step events.

## UI

`ExecutionTrace` uses the existing AgentTree and AgentLanes, inside a collapsed “运行轨迹” disclosure in chat and details. Local AAL spans represent actual kernel invocation and Host boundaries. They are not Axon receipt proof. Unconfirmed running spans are marked stopped when observation ends, with an explicit error explaining that no terminal runtime event was observed.

## Verification on 2026-10-28

- Real Rust compiler/kernel tests with explicitly controlled model Host: success, Host failure, cancellation.
- Browser: real Claude Code and Codex calls through the worker, list/read notebook tools, actual answers and usage, tree/time-line inspection in details.
- Installed EasyNet CLI: actual local compilation of an EAL mission to IR; the compile-only target is deliberately not a claimed deployed device.
- EAL trace projection unit test uses explicit fixture data; it is not distributed execution evidence.
- No pairing, credentials, publication, or permissions were changed. EAL runtime/receipt/cancel end-to-end verification remains unavailable until an admitted daemon and governed ability deployment exist.

## Live observation increment (2026-10-28)

`POST /agent-api/eal/watch {trace}` now streams NDJSON from the native
`easynet invocation watch --trace … --follow --format json` observer. State
and terminal notifications are followed by a fresh native `invocation trace`
ledger document (records plus causal edges), not the archived mission trace.
`EalOrchestration.watch` consumes the stream and releases its reader when closed.
Unsubscribing kills only the observer process. Explicit mission cancellation
remains a separate operation. Pending, local liveness, terminal receipt claims,
observer errors and observer end remain distinct. No receipt verification claim
is upgraded by the bridge.

Local live endpoint verification returned the actual daemon error:
`runtime governance read subject unavailable: no credentials found`.
This is not evidence of a successful distributed invocation.

Implemented in the subsequent increment:
- `EalAbilityRuntime` launches a uniquely named EAL mission, discovers only its
  exact live source/name metadata, then forwards native invocation.watch/ledger
  spans into the same Agent turn stream used by chat and details.
- `aal-agent-provider` packages `NotebookAgent.run` as `notebook.agent` using the
  canonical provider SDK. Its owner-only, single-use local socket Host reuses
  the same model/tool/approval lifecycle as the process-local AAL worker.
- Explicit `AAL_EASYNET_TARGET` selects EAL dispatch (no fallback after errors).
  Leave it unset for the independently useful local AAL execution mode.
- Cancellation closes the local Host and calls mission.cancel once an owned
  run anchor is available. Missing acknowledgement is an error, not proof of
  remote termination. Retry creates a fresh mission, Host ticket and approvals;
  persistent provider replay remains journal-owned.

Build and package from the AAL repository:

```sh
adapters/easynet/cargo-local.sh /path/EasyNet-Cli /path/EasyNet-Axon build --bin aal-agent-provider
adapters/easynet/target/debug/aal-agent-provider package /absolute/new/package-directory /absolute/Notebook-Frontend/server/agent/aal/notebook.aal
```

After pairing, install that directory with `easynet plugin install` and set
`AAL_EASYNET_TARGET` to the hosting device target in `.env.local`, then restart
Vite. The notebook-bound model Host must be on the same machine/user as the
provider; do not configure a remote target for this private local socket Host.
Canonical authority/admission and signed receipts remain daemon responsibilities.

Pairing-dependent verification:
- Daemon admission/install and actual remote invocation.
- Signed live receipts, remote cancellation acknowledgement and restart/retry.

The compact execution tree keeps ordinary name/status/time rows on one line;
errors and approval prompts retain expanded cards. Existing details remain
accessible. The initial browser acquisition was blocked; subsequent validation on a fresh
local test page succeeded with real models (see the linked verification report).
Six observer/projection backend tests and nine tree interaction tests passed;
the frontend tests report jsdom's existing unsupported window.scrollTo warning.

## Notebook organization and standard-library boundary (2026-10-29)

Notebook owns the reusable `notebook` skill and its AAL Agent source. The native worker/ability provider loads that source rather than concatenating generic provider classes and inline notebook instructions. The canonical package keeps the public `notebook.codex` and `notebook.agent` bindings. Repackage after changing SKILL.md: a stale frozen resource is rejected rather than silently replaced. Local package verification is not daemon installation or remote deployment.

## Source-driven Notebook skill verification (2026-10-30)

The deployed local worker was rebuilt at the configured `AAL_AGENT_WORKER` path. Both NotebookAgent and CodexAgent were exercised with the actual AAL compiler and kernel. The canonical EAL provider was rebuilt and packaged using this repository's `notebook.aal` source; controlled-Host tests verified resource delivery, approval waiting/rejection, cancellation and idempotent replay. No remote installation or paid model invocation was performed.

Checks: 31 server tests passed across the integration run and added missing-resource test; 2 live-model tests were intentionally skipped. Agent TypeScript, targeted ESLint and frontend production build passed. Missing skill imports fail at compilation; mismatched skill deployments fail before the model Host runs. The skill's tool inventory is tested against the authoritative Notebook tool schemas, including proposal, cancellation and Markdown insertion.
