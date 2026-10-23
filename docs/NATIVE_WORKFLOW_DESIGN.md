# Native workflow design client

`src/services/native-study/WorkflowDesignClient.ts` is the typed browser boundary for
AAL's workspace-scoped `/workflow/draft` and `/workflow/execute` routes. It uses the
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

Both operations validate inputs and copy them before awaiting the server. Caller edits
cannot change which identity or fingerprint the response must match. Requests over the
server's 5 MiB body bound reject locally. The caller's abort signal reaches the shared
transport, and even a late response after cancellation is rejected. HTTP rejection or
schema mismatch is surfaced without an automatic retry or a fresh operation ID.

This commit supplies the client boundary only. A source-review/execution panel,
persistent operation/session ownership, and browser recovery controls still need to
be connected. A caller must retain the exact inputs and operation ID for a retry;
generating a fresh ID after an unknown response would represent new work. No UI or
end-to-end browser workflow is claimed by the unit tests.

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
