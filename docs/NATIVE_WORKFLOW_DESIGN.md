# Native workflow design client

`src/services/native-study/WorkflowDesignClient.ts` is the typed browser boundary for
AAL's workspace-scoped `/workflow/draft`, `/workflow/execute` and `/workflow/resume` routes. It uses the
existing `NativeNotebookTransport` and Vite `/aal-api` proxy. No browser compiler,
Python executor or numerical implementation is introduced.

`draft(input, signal)` sends explicit reference/query CSVs, features, clustering and
neighbor parameters, maximum distance, goal, class name, workspace revision and
operation ID. It returns the source, owned draft inspection and compiler fingerprint.
The response must identify the same frontend notebook, workspace, revision, invocation
and class; `execution_authorized` must remain false. Native measured data IDs are
retained for display. The browser does not independently recompile source to verify
an artifact fingerprint or recompute those data IDs.

`execute({context, draft, expected_fingerprint}, signal)` is a separate explicit
operation. Its returned artifact fingerprint must exactly match the requested one.
The client retains the native `completed`/`suspended` discriminated envelope. Completion
requires a `value` field, including a valid null value; suspension requires native
workflow/state/invocation fields and is never promoted to completion. Generated output
is arbitrary business data, not automatically accepted housing evidence or FoKn facts.

All operations validate inputs and copy them before awaiting the server. Caller edits
cannot change which identity or fingerprint the response must match. Requests over the
server's 5 MiB body bound reject locally. The caller's abort signal reaches the shared
transport, and even a late response after cancellation is rejected. HTTP rejection or
schema mismatch is surfaced without an automatic retry or a fresh operation ID.

The model-enabled housing panel now connects this client through
`WorkflowDesignSession` and `WorkflowDesigner`. Source review and explicit execution
are separate controls. The session lifecycle and browser evidence are described below.

Validation covers request serialization/scope, source inspection, exact fingerprints,
completed and suspended outcomes, missing result values, invalid input, identity
mismatches, mutable input and cancellation. Run:

```sh
npx vitest run src/services/native-study/WorkflowDesignClient.test.ts
```

Validation: 12 workflow-client tests plus the existing packaged-model client test
passed. Scoped ESLint, Prettier and diff checks passed. Full `tsc --noEmit` still exits
2 with diagnostics outside the workflow client/transport files; no full-project type
check success is claimed. Logs: `/tmp/aal-workflow-client-tests.log`,
`/tmp/aal-workflow-client-lint.log`, `/tmp/aal-workflow-client-types.log`.
No real provider or online EasyNet requests were made.


## Review and recover in the housing panel

With a model-enabled native server, **生成并审阅房屋工作流** uses the reference/query
CSV, feature columns, clustering/neighbor parameters and maximum from the housing
form. **生成工作流草稿** freezes those values with a new operation ID. The response
shows the source, public contracts and artifact fingerprint. The user must check
**我已查看源码和冻结输入，确认执行此版本** before **执行已审阅工作流** becomes enabled.
Form edits after generation do not change the frozen execution input; inspect the
saved-input disclosure or clear an unexecuted review to prepare another draft.

`WorkflowDesignSession` owns this explicit lifecycle:

```text
drafting -> review -> executing -> completed | suspended
suspended -> continuing -> completed | suspended
```

Each request intent is saved in sessionStorage before dispatch. Browser response loss
or failure to save a received result retains the pending stage and exact operation
ID. Reload performs no network request: **恢复原工作流操作** explicitly reuses that
stage/input. Execution uses a distinct ID and binds the reviewed draft/fingerprint.
Storage failure before saving intent prevents dispatch. Restored records are validated
with the same response parsers as live calls; inconsistent scope, phase, input or
fingerprint blocks the session. Disposing a panel aborts its request and ignores late
responses. Nested saved input is frozen against accidental mutation.

Records are keyed by frontend notebook, native workspace and revision. Switching
revision shows that revision's separate record; older records are retained in the
tab but are not automatically resumed. Backend historical cross-revision access is
still unsupported. Closing the tab loses this browser retention. No cross-tab recovery
or global operation history is claimed.

Only unexecuted reviews and completed records can be cleared. Clearing local state
does not delete native drafts/deployments, so the panel proposes a fresh unique class
name for the next draft. Unknown outcomes and suspended workflows cannot be cleared
through this control. Suspended output is labeled incomplete; the explicit continuation
control below reevaluates its native wait condition. Results are displayed as generated output and are never
automatically published as Notebook/FoKn evidence. PCS automatic acceptance and
EasyNet product deployment remain separate work.

Validation: 29 client/session/component tests passed, including the existing housing
panel regression suite. Chromium exercised the actual Rust server: measured neighbor
selection and counts match the captured native comparison, source review gates the
execution control, a deliberately lost success response is recovered after server
restart with the provider shut down, and the exact result returns with one total
fixture model request. The browser test passed in 12.9 seconds (15.3 seconds total).
Scoped ESLint, formatting and diff checks passed. Full TypeScript checking still fails
outside the modified workflow/panel files, with no diagnostics in those files.
Logs: `/tmp/aal-workflow-session-tests.log`, `/tmp/aal-workflow-session-lint.log`,
`/tmp/aal-workflow-session-types.log`, `/tmp/aal-workflow-browser.log`.
No paid model or online EasyNet calls were made.

Run the browser regression with a built model/web Rust server and an unused loopback
port (the existing Playwright configuration starts Vite itself):

```sh
AAL_NATIVE_SERVER=/path/to/aal-notebook-server \
AAL_NOTEBOOK_TARGET=http://127.0.0.1:8798 \
npx playwright test tests/browser/native-workflow-design.spec.js
```

## Continue a suspended child without replacing its identity

**继续挂起工作流** is available only for a confirmed suspended record. It freezes a
new continuation attempt ID and the original execution ID, preserving the reviewed
artifact and measurement input. This intent is saved before `/workflow/resume` is
sent. A failed/unknown continuation remains `continuing`; **恢复原工作流操作** reuses
that exact attempt after reload or response loss. The UI cannot create a replacement
attempt while an outcome is unknown. A confirmed still-suspended response permits a
new explicit attempt; completed work cannot be continued through this control.

The record keeps the original execution response and the latest continuation response
separately. The latter must match both invocation IDs, reviewed fingerprint, original
deployment and measured reference/query IDs. Restored and live responses share these
checks. Original result history is unchanged; the UI displays the latest continuation
result when present. Previous continuation attempts remain in the native journal, not
in an unbounded browser history. No wait predicate is bypassed or new child authority
granted. Revision changes retain the existing isolation rules.

Validation: 34 client/session/component tests passed. Two actual Chromium/Rust tests
passed (25.9 seconds total): the original measured selection recovery, and suspension,
an attempt that remains waiting, a distinct native fixture call that opens its shared
gate, completion with a lost response, then server restart/browser reload and recovery
of the identical attempt. Native preparation/completion counters remain two; recovery
adds no writes. Each browser case uses one scripted model request. The gate is a
lifecycle fixture, not evidence of real-model workflow quality or a user approval flow.
Logs: `/tmp/aal-front-continuation-tests.log`, `/tmp/aal-front-continuation-browser.log`.
Scoped ESLint and formatting checks passed. Full `tsc --noEmit` still exits 2 with
existing diagnostics elsewhere and none in the modified workflow/transport files;
this is not a full-project type-check pass. Logs:
`/tmp/aal-front-continuation-lint.log`, `/tmp/aal-front-continuation-final-lint.log`,
`/tmp/aal-front-continuation-types.log`. No paid model or online EasyNet calls occurred.

## Assess a retained numerical result

**验收房屋筛选结果** reads the confirmed original execution or latest confirmed
continuation through `/workflow/assess`. It uses the original frozen execution input
and explicit continuation operation ID; no generated child or model is invoked.
Unknown execution/continuation outcomes must first recover their existing operation.
The UI displays pending, matched or mismatched, differing field names and the native
expected/observed values. This only assesses the housing-neighbor-selection-v1
contract for this measured instance, not arbitrary goals or unseen inputs.

The client validates workspace/revision, original and continuation IDs, deployment,
fingerprint, reference/query identities and equality with the retained execution
value. It also checks status/difference consistency and the expected selection count.
A response with invented provenance or a forged matched status is rejected. Expected
neighbor selection itself comes from the Rust oracle, not another browser algorithm.

Assessment is a transient read, not persisted acceptance authority. Reload requires
an explicit new check. New continuation, clear, scope change and disposal invalidate
its display; busy operations cannot overlap. Response loss can retry the read without
new execution. No PCS adoption, FoKn publication or deployment follows a match.

Validation: 27 scoped client/session/component tests pass. Two actual Chromium/Rust
scenarios pass (24.0s): matched selection after provider shutdown/server restart and
lost assessment response; mismatched incomplete output from a specific completed
continuation after restart. Each uses one scripted drafting request. The original
execution counters remain unchanged. Logs: /tmp/aal-front-assessment-tests-final.log
and /tmp/aal-front-assessment-browser-final.log. Scoped ESLint passes.
Scoped formatting and ESLint pass, including the final session-test correction.
Full tsc --noEmit exits 2 with diagnostics elsewhere (for example ImageView and
LaTeXExtension), with none in the changed workflow/transport files. This is not a
full-project type-check pass. Log: /tmp/aal-front-assessment-types-final.log.

## Publish checked instances to native FoKn

After a fresh assessment of a confirmed completed execution, **保存本次验收为 FoKn
实例证据** explicitly publishes the original execution or latest continuation through
`/workflow/publish`. Both matched and mismatched instances can be saved: the service
recomputes assessment from its retained result and publishes supported or refuted
practice evidence. The browser never sends an assessment body as evidence authority.
The existing numerical instance boundary remains unchanged; no PCS adoption follows.

The session saves a frozen request and UUID before dispatch. Pending publication is a
separate state within the completed workflow record. Response loss or a failed local
result save leaves that exact intent pending; **恢复原证据发布** reuses it after reload.
A pending publication cannot be cleared or replaced by another publication ID. Only
confirmed receipts may be cleared locally. Current workspace/revision rules still
apply, and disposal aborts delivery into a superseded component.

Receipt validation reuses numerical assessment checks and additionally binds publication
ID, WorkflowEvidence owner/invocation, threshold and field-match flags. Supported and
refuted status must agree with the checked numerical outcome. Saved records undergo
the same validation on reload. The UI labels the result as a historical publication
receipt: another instance may stale the claim, so replay does not imply current support.
The separate evidence owner is not yet merged into the study-workspace context view.

Validation: 29 scoped client/session/component tests, scoped ESLint and formatting pass.
Two Chromium/Rust scenarios pass in 29.7 seconds: lost supported-publication response,
server restart/browser reload and identical-ID receipt recovery; and publication of
a refuted completed continuation. Child execution counters remain one/two respectively,
with one scripted drafting request per case and the provider already shut down.
Logs: /tmp/aal-front-publication-tests.log, /tmp/aal-front-publication-browser.log,
and /tmp/aal-front-publication-lint.log. No paid model, online EasyNet or push.
Full tsc --noEmit still exits 2 on existing editor diagnostics, with none in the
changed workflow/transport files; this is not a full-project type-check pass.
Log: /tmp/aal-front-publication-types.log.

## Current evidence inspection

Confirmed publications now offer **刷新当前证据状态**. The client sends only workspace,
revision and the saved claim ID to `/workflow/evidence`, then validates the returned
notebook/workspace/revision, claim ID and exact original owner/invocation/call ID.
It displays supported, refuted or stale alongside the unchanged historical receipt.
The value represents the most recent explicit query, not a live subscription.

Current status is transient: it is not saved with publication intent or receipts.
Reload, failed refresh, clearing the record and session disposal cannot restore an
old observation as current authority. Reads use the session's existing busy/abort
lifecycle and never execute or publish another operation. This is the separate
WorkflowEvidence forest, not a merge into the study-workspace knowledge context.

Validation: 30 scoped client/session/component tests and scoped ESLint pass. Both
Chromium/Rust scenarios pass (35.9 seconds total). The first queries support, executes
and publishes a distinct second instance, observes the original claim become stale,
rejects a lost read, and re-reads stale state after server/browser restart while the
original supported receipt and original execution output stay intact. Model drafting
uses one scripted request per scenario; no paid model or online EasyNet calls.
Full TypeScript checking still exits 2 on diagnostics outside these changed files;
none mention WorkflowDesign, workflowFixture or NativeNotebookTransport.
Logs: `/tmp/aal-front-current-tests.log`, `/tmp/aal-front-current-browser.log`,
`/tmp/aal-front-current-lint.log`, `/tmp/aal-front-current-types.log`.
