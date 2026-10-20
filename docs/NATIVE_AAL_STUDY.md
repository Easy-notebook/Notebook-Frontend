# Native housing studies in Notebook-Frontend

The existing workspace now has a **房屋研究** action. The home header also offers
**新建房屋研究**: it creates an independent Rust study and persists an editor document
through the existing IndexedDB repository before navigation. This path does not
initialize a Python kernel.

## Run locally

Start the Rust application from Agent-Assembly-Language:

```sh
cargo run --manifest-path demos/notebook/Cargo.toml --features web \
  --bin aal-notebook-server -- /tmp/aal-frontend-studies 8787
```

In Notebook-Frontend:

```sh
AAL_NOTEBOOK_TARGET=http://127.0.0.1:8787 npm run dev -- --host 127.0.0.1
```

Open the local Vite address. Choose **新建房屋研究**, then **房屋研究** in the workspace.
Paste/upload the reference CSV, select numeric feature names (one per line), save,
and run grouping. The AAL fixture `demos/notebook/fixtures/house-segments.csv` works
with `area`, `rooms`, and three clusters. Compare `new-houses.csv` with three neighbors.
Expand a query to inspect reference row IDs, cluster assignments, standardized
feature differences and squared-distance contributions. **保存样本证据链** retains
FoKn facts and their rule-derived explanation. **写入当前笔记** inserts a historical
snapshot and awaits the existing notebook save queue; the same revision is inserted
once even if saving needs retry.

To enable PCS source revision and measured selection, configure the existing AAL
model environment and run the Rust server with `--features web,model` and
`--generated-selection`. Use a separate state root for this composition. The panel
then shows goal/maximum-distance selection over at most eight saved query samples.
Finite acceptance checks do not prove correctness for every input.

## Boundary and persistence

The Vite proxy maps `/aal-api/workspaces/{encodedNotebookId}/{state|command}` to
Rust `/api/workspaces/...`. It accepts only a configured loopback HTTP target and
checks incoming Host/Origin before replacing the upstream Origin header. There is
no wildcard CORS grant or automatic fallback to the old backend. Production hosting
needs an equivalent same-origin proxy; the built assets alone do not deploy Rust.
This local endpoint is not an authenticated multi-user network service.

The Rust server hashes the exact UTF-8 notebook ID into a storage directory, admits
at most 128 notebooks, and separates each notebook snapshot from its owned generated
versions. IDs must be nonempty, at most 256 UTF-8 bytes and contain no control
characters. Imported names with spaces, Unicode or slashes are opaque keys, not paths.
The response independently identifies the frontend notebook and native document UUID.
Commands include that UUID, expected revision and an invocation ID. A shared bounded
worker serializes native work, and different notebooks cannot reuse one another's
owned generated versions.

`NativeStudySession` owns disconnected/loading/ready/running/recoverable states.
It writes the frozen request to per-notebook sessionStorage before dispatch. Retry
retains the original invocation and arguments after remount/reload. Closing a panel
aborts browser observation; it does not promise to cancel work already admitted by
Rust. Abandoning retry is explicit. A disposed session cannot remove a newer retry
record or publish into a different editor notebook.

The browser validates response structure and identity. Rust owns algorithms,
revision checks, workflow recovery, FoKn evidence and generated-code acceptance.
The editor export is explicitly a dated/revisioned observation; future source
changes do not silently rewrite the user's prose.

## Supported scope

Implemented here: native study creation, housing feature grouping, saved-reference
comparison, sample evidence, optional checked selector, and editor publication.
This does **not** replace the existing general `/execute`, file-management,
`/send_operation` streams, arbitrary QA/workflow services or Python code cells.
Those existing endpoints remain a separate integration inventory; no successful
housing test is evidence that all frontend backend contracts have been migrated.
No online EasyNet pairing or production network validation was performed.

## Verification

- Native actual HTTP tests: separate IDs/revisions, wrong-document rejection,
  restart, generated-version ownership, failure/retry and result invalidation.
- Frontend tests: frozen retry, storage failure before dispatch, disposed-result
  suppression, concurrent command rejection, response identity, imported names,
  StrictMode admission, native notebook creation and durable/idempotent publication.
- Browser: create → configure → group → compare → FoKn evidence → publish to editor.
- Existing unrelated frontend type errors remain; use the targeted test/lint output
  and build result rather than treating a full repository type check as passing.
