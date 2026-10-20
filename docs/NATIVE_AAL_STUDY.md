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

**上传并读入 CSV** now saves a UTF-8 CSV version in Rust before filling the study
input. **读取已保存 CSV** lists this notebook's archive, including older versions
of a changed filename. Select a version to read and verify its exact bytes. A changed
draft must be saved before running grouping or comparing new samples; the previous
result remains explicitly identified as belonging to the last saved input.

The archive is immutable: identical filename/content uploads return the same version,
including after a lost response or server restart. Changed bytes produce another
version. The browser checks notebook ID, version, byte length and SHA-256. Each
notebook retains at most 128 versions and 16 MiB of raw content; each file is limited
to 4 MiB and each JSON request to 5 MiB. Names are flat `.csv` names up to 256 UTF-8
bytes. No silent eviction or delete operation is provided. At capacity, existing
versions remain available; start another notebook for further data.

The version is SHA-256 of filename UTF-8, a NUL separator, and exact CSV UTF-8.
A separate SHA-256 covers only CSV bytes. UTF-8 BOM is retained; invalid UTF-8 is
rejected instead of replaced. Closing or switching a panel aborts observation and
suppresses late publication, but cannot undo a completed upload. Re-uploading the
same file safely resolves an unknown upload outcome.

Saved studies retain their full CSV input and existing invocation/revision history.
The picker displays the most recently loaded filename/hash; it does not claim a
persisted filename lineage in study exports. This archive belongs to the native
study and is separate from the generic Python file browser. It does not expose
arbitrary disk paths, binary downloads, or files to Python cells. AAL cells can
explicitly read pinned CSV versions as described below.

To enable PCS source revision and measured selection, configure the existing AAL
model environment and run the Rust server with `--features web,model` and
`--generated-selection`. Use a separate state root for this composition. The panel
then shows goal/maximum-distance selection over at most eight saved query samples.
Finite acceptance checks do not prove correctness for every input.

## Boundary and persistence

The Vite proxy maps `/aal-api/workspaces/{encodedNotebookId}/{state|command|execute}` to
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
comparison, immutable CSV storage, sample evidence, optional checked selector, editor publication and AAL
code-cell execution. This does **not** replace the Python `/execute`, file-management,
`/send_operation` streams or arbitrary QA/workflow services.
Those existing endpoints remain a separate integration inventory; no successful
housing test is evidence that all frontend backend contracts have been migrated.
No online EasyNet pairing or production network validation was performed.

## Run AAL code cells

New housing notebooks contain a runnable nine-row grouping example. Click its run
button; existing cells can select **AAL · Rust**. The Rust compiler executes a
complete `agent Cell is Agent` program with a public, zero-argument `run` ability.
The return value is displayed as JSON; compile/runtime errors use the existing
error output. No Python kernel initialization, polling or translation occurs.
The editor currently displays AAL source as plain text.

Every run has fresh local VM state. Explicit `notebook_get(name)` and
`notebook_set(name, value)` exchange committed notebook data; implicit globals and
the saved housing-study document are not shared. Native language computations and the numerical skills
`numeric_segments`, `segment_assign`, `segment_compare` are available. The
`notebook_csv(version)` skill reads one immutable CSV version owned by this notebook.
Arbitrary file, process, network, clock and model Host calls are unavailable.

After loading a version in **房屋研究**, use **插入 AAL 分群单元格**. It creates and
durably saves a complete AAL program using that file version and the visible feature/
cluster settings. Close the panel to run the cell. The program reads the saved file
version, so later same-name uploads do not change its input. Its output includes the
measured groups and an actual-read file/version/hash record. Editing the CSV textarea
does not change an immutable saved file version.

Repeated insertion of the same configuration does not duplicate the cell, including
after a save failure. A changed configuration gets a distinct cell. If the generated
cell has been edited, insertion reports a conflict and preserves that edit. Notebook
navigation and panel disposal cancel pending insertion observation; an already saved
cell is not rolled back.

The parent supplies a verified read-only archive snapshot to the supervised worker;
the child receives no filesystem path. Snapshot bounds remain 128 versions, 16 MiB
of raw CSV and 32 MiB encoded; internal worker input is capped at 34 MiB including
source and the committed shared-value snapshot. This copies the bounded archive per run. An invalid archive blocks new cell
work, while completed invocation replay uses its existing result without reopening
the archive. Worker death may leave no returned read log. Shared mutable globals,
filesystem access and cross-cell FoKn state are not introduced by this read-only path.

Execution uses a supervised Rust child process: 32 KiB source, 100,000 fuel,
10 seconds wall time, 512 KiB formatted result, 1 MiB response and 2 MiB worker output (including staged writes) limits.
These are local trusted-authoring limits, not a hostile-code memory/OS sandbox.
Native cancellation and kernel restart are disabled because no persistent cell
kernel is exposed. Python cells continue to use their explicit Python backend.

`NativeCellExecution` persists `{cell_id,source,invocation}` before dispatch and
checks the notebook/cell/invocation in the terminal response. A transport failure
can be retried by running the same source again, including after reload. Changed
source starts a new scratch calculation. The server retains exact result replay
(including compile/runtime failures) across restart, with 256 executions and 16 MiB
per notebook; it refuses new work at capacity rather than evicting replay history.
A different request under an existing invocation UUID conflicts.

Completed outputs use the existing editor save path. Notebook reload now preserves
the cell's stored `language`, preventing saved AAL from being routed as Python.
Late completion after switching notebooks cannot publish into the new document.
The native browser request has a 20 second deadline. A stalled/aborted request
keeps its invocation for retry; this does not claim cancellation of server work.

## Run All

**Run All** admits up to 256 distinct code cells in their document order. AAL cells
use the Rust path above; Python cells retain their explicit Python backend.
The execution session reserves admission for the whole batch, including the gaps
between requests. A repeated request for the same active batch joins it instead
of cancelling a cell or submitting duplicate work. Individual runs and other
batches cannot insert work into the admitted sequence.

All selected cell identities, source and languages are captured at admission.
Unsupported languages fail preflight before any output is cleared. Editing the
source/language or deleting a selected cell stops the batch and suppresses late
results from that context. Switching notebooks, even away and back, also ends the
old batch. Newly added cells are excluded; reordering does not change the admitted
order. Output-only updates do not invalidate a run.

The first execution error stops subsequent dispatch. Only the cell that actually
starts has its previous output cleared; later cells retain their historical results.
**Stop Run All** lets the admitted cell finish and save, then stops before the next
one. While waiting, the button displays “Finishing current cell…”. It does not send
a fictitious Rust cancellation request. If the last cell already finishes, the
batch is complete.

The notebook action rejects incomplete execution instead of reporting all cells
succeeded. Completion, failure and explicit-stop notices use the application's
mounted Sonner notification system and are suppressed after notebook navigation.
The existing `runAllCells(): Promise<void>` public signature is preserved.
Starting Run All again creates a new batch from the beginning; there is no claim
of durable batch-plan resume or implicit shared VM globals. Native per-cell retry
continues to use its exact persisted invocation.

## Verification

- Native actual HTTP tests: separate IDs/revisions, wrong-document rejection,
  restart, generated-version ownership, failure/retry and result invalidation.
- Frontend tests: frozen retry, storage failure before dispatch, disposed-result
  suppression, concurrent command rejection, response identity, imported names,
  StrictMode admission, native notebook creation and durable/idempotent publication.
- Browser: create → configure → group → compare → FoKn evidence → publish to editor.
- Native cell browser: create → execute AAL grouping → reload, preserving language
  and output (three groups, nine rows, silhouette `0.9692193427143321`).
- Batch browser: Run All executes native grouping followed by area screening;
  a first-cell compiler failure stops before the second and retains its output.
  Corrected source runs again and both outputs survive reload. Rust result history
  independently confirms the failed batch added only the first cell's result.
- Existing unrelated frontend type errors remain; use the targeted test/lint output
  and build result rather than treating a full repository type check as passing.

## Executable similarity comparisons

After saving the reference input and running grouping, enter the query CSV and
neighbor count, then choose **插入 AAL 相似样本单元格**. This captures the saved
reference configuration and the **current query form**, rather than assuming the
form matches a previously displayed comparison. The generated `Cell.run` fits the
pinned reference and calls native `segment_compare` with that model's measured
reference identity. Its result contains reference row indices, cluster assignment,
standardized feature differences and each feature's squared-distance contribution.
Close the research panel and run the inserted AAL cell; Run All also supports it.

The publisher archives exact inputs as `housing-reference.csv` and
`housing-query.csv` within the same notebook, verifies their content/owner metadata,
and embeds both immutable versions in source. Filenames are descriptive; only the
versions grant reads through `notebook_csv`. Uploading a changed file cannot retarget
the cell. Execution records both successfully read versions alongside measured output.
The scratch cell does not write FoKn study state: **保存样本证据链** remains the
study's explicit evidence-publication action. A fresh execution recomputes numerical
results using the installed Rust implementation; input pins are not a runtime-version
lock. Completed invocation replay retains its original result.

Two uploads and notebook persistence are not a distributed transaction. A query
upload failure leaves any completed reference version, but inserts no cell. Retry
reuses identical archives. Save failure can leave the inserted cell in local memory;
retry persists the same source-derived identity without duplication. Edited matching
cells are never overwritten. Navigation (including away and back) or panel disposal
aborts subsequent work and suppresses a success acknowledgement; a committed upload
or save is not rolled back. Both publication buttons share the owned lifecycle.

Existing grouping source identities and public HTTP contracts are unchanged. The
same archive quotas and worker fuel/time/output bounds apply; a comparison that
exceeds cell output limits fails instead of dropping feature evidence. Study inputs
support up to 128 query rows, but fitting the cell output bound may require fewer.
General files, implicit shared VM globals and online EasyNet validation remain
outside this path.

## PCS planning across the complete study

With the Rust server started using `--generated-selection`, the research panel now
also offers **由 PCS 规划并执行完整研究**. Prepare reference CSV, query CSV, neighbor
count, goal and distance maximum, then choose this action. It can start before a
manual fit. PCS selects feature columns/cluster count and plans comparison, optionally
one sample's FoKn proof and checked generated selection. Manual feature settings are
not silently treated as constraints on PCS; express required choices in the goal.
The server validates action ordering, row bounds and caller authority before adoption.

The current form inputs, maximum, original revision and invocation are persisted
before dispatch. **重试原操作** reuses the complete frozen command even after closing
and reopening the panel. Completed steps remain durable if a later model/source
request fails; exact retry resumes them. Refresh can inspect those partial results.
Closing the panel or abandoning retry does not undo server work. Existing manual
comparison/selection and study snapshot publication remain available.

This uses the same Rust numerical calculations, FoKn fact/proof engine, generated
source compiler and immutable selector lifecycle as the individual actions. The
frontend performs no numerical or workflow execution. A planned task can omit
unnecessary evidence or selection actions; it cannot change the supplied query CSV,
neighbor count or maximum. The API also accepts a null maximum to forbid selection.
Only one current sample proof is retained, matching the existing evidence view.
Arbitrary workflow DAGs and online EasyNet verification are not established by this
path.


## Reuse a fitted reference in later cells

After saving reference data, fill the query CSV and choose
**插入可复用的拟合与比较单元格**. This saves two AAL cells. Run the fit cell first;
the comparison cell then reads its stored model without fitting again. Run All also
executes this order. Additional query configurations reuse the same producer cell
when reference version/features/cluster count are unchanged. Existing edited cells
are preserved and reported as conflicts.

The private native skills `notebook_set(name, value)` and `notebook_get(name)` expose
this same capability to authored AAL. Writes are staged until the complete cell
succeeds and its result is durably saved. Runtime failure and timeout discard writes;
replaying an old invocation never overwrites later values. A new execution reads
currently committed values, and its outputs list the producer invocation(s) actually
read. Values survive browser/server restart and belong only to this notebook.

The state retains at most 64 names (128 UTF-8 bytes each), 256 KiB per native value
and 1 MiB total. Scalars, lists and records retain native integer fidelity; closures,
named types and typed maps require explicit portable data projection. Depth is at
most 32; non-finite numbers are rejected. Existing execution-history limits still
apply. There is no implicit global interpreter, cross-notebook sharing, deletion API
or automatic recomputation of dependent cells. Explicitly rerun a comparison after
changing its producer; old displayed results remain historical observations.

Browser verification requires a locally built native server:

```sh
AAL_NATIVE_SERVER=/absolute/path/to/aal-notebook-server \
AAL_NOTEBOOK_TARGET=http://127.0.0.1:4256 \
npx playwright test tests/browser/native-shared-values.spec.js
```

The test starts/stops an isolated Rust server and uses actual browser storage,
source publication and native execution. It does not pair with EasyNet.

Verification for shared values: 49 relevant Vitest cases and the Chromium workflow
above pass against the native server. The full frontend `tsc --noEmit` gate still
reports 66 diagnostics in other editor/UI/stream files; this is not a claim of a
clean full-project type check. The changed native-study paths have no diagnostics
in that run.
