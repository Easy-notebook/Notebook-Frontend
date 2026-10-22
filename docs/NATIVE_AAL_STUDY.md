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

The **FoKn 样本事实与推导** section now shows the saved query/reference versions,
same-cluster conclusions in neighbor-rank order, measured distances and each
conclusion's current status. Expand a conclusion to inspect its premise assessment
revisions and original Agent/invocation/step identifiers. **测量事实** lists the
retained facts; **完整证据 JSON** preserves the native record for inspection.
These are local Rust evidence projections, not independent browser proof verification
or signed EasyNet receipts. Empty answers do not mean that no similar samples exist.

Changing the saved study input retains the historical evidence and marks it expired.
Status is read from the current native knowledge graph, not inferred from the presence
of a saved answer. Save evidence again after recomputing the comparison to replace it.
The existing request owner handles response loss and restart with the same invocation;
the view adds no independent execution or recovery path. Typed response parsing checks
answer/graph identity, premise links and query/reference scope before rendering.

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
The native browser request has a 75 second deadline. A stalled/aborted request
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

## Discuss actual research with native collaborators

The housing panel now includes **与协作者讨论研究**. With model-enabled Rust,
choose **开始研究讨论** once when the native document has no chapter. This executes
the original `new_chapter` operation. Select a collaborator from the server catalog,
enter **研究问题**, and send. The fifteen original collaborators remain available;
**房屋特征分群** uses the current saved housing measurements, comparison terms and
conversation history supplied by Rust. Unsaved form inputs are not sent. Save a
changed reference before discussing it; changing input invalidates earlier results.
Discussion does not refit, deploy or modify the numerical model.

Configure the existing native model environment, then start with model support:

```sh
cargo run --manifest-path demos/notebook/Cargo.toml --features web,model \
  --bin aal-notebook-server -- /tmp/aal-frontend-studies 8787 --model
```

Use `AAL_MODEL_ENDPOINT` and `AAL_MODEL`, or the existing `AAL_MODEL_ROUTES` deployment
configuration. The frontend never handles provider credentials. Without a configured
model, saved discussions remain visible while sending is disabled.

The existing `NativeStudySession` owns chapter and communication commands: it captures
the current native document/revision, persists the exact invocation before dispatch,
and preserves it on response loss. **重试原操作** resumes that request after reload;
it does not submit another question. History is read from Rust, including when the
server restarts without a model. Closing the panel stops observation but does not
undo an admitted command. Switching notebooks resets the local draft and displays
only the newly selected notebook's history.

Questions and answers are bounded to 8,192 UTF-8 bytes each, with at most 128 retained
exchanges. Historical model replies are rendered as plain text, separately from
measured evidence. **写入当前笔记** includes the saved questions/replies in a separately
labelled model-discussion section of the immutable study snapshot. The existing
save queue and publication identity prevent duplicate insertion on retry.

Verification: 48 targeted Vitest tests and both native Chromium workflows pass.
`tests/browser/native-discussion.spec.js` starts an isolated Rust process and a
scripted loopback HTTP model, fits twelve houses, compares two query rows, checks
actual model-request measurements and feature terms, loses the completed response,
then shuts down the model and restarts Rust. Retrying retains one answer and one
revision increment without another model request. It also saves the discussion into
the editor. Run it with the same environment as the shared-value browser test; the
server binary must be built with `web,model`. This verifies transport and measured
context, not live-model answer quality or generic `/send_operation` compatibility.

## 执行进度

房屋研究任务和协作者问答运行期间，面板会读取 Rust 当前调用的观察状态，显示
“正在等待模型回答”或“正在执行数据技能”，以及已返回成功/错误的调用数量。
这些数量包含前置读取，不等于已完成的研究步骤，也不是完成百分比。

观察接口是 `/aal-api/workspaces/{id}/operations/{invocation}`。每次实际接收执行请求
都有独立 attempt ID；服务只保留最近 128 条观察，重启后为空。网络重试尚未被接收时，
可能仍看到上一次尝试。未知或无法读取进度不表示未执行。原有请求编号、修订校验和
持久化恢复逻辑仍负责确认结果；进度不会自动重发请求或清除待恢复记录。

前端延迟 500 ms 开始读取，之后串行轮询，每次读取最多等待 3 秒。切换笔记、关闭面板、
重试替换、成功读取最终结果或放弃重试都会终止旧观察，迟到响应不能更新新会话。
浏览器测试在实际房屋拟合与近邻比较后暂停本地模型响应，验证等待状态可见，再测试
响应丢失、Rust 重启和原请求恢复。此接口不包含代码单元格进度、模型 token 流或
EasyNet 收据，线上验证仍按用户要求暂缓。

## 保存与复用研究技能

完成房屋分群和相似样本比较后，展开 **可复用研究技能**，用新名称保存当前研究。
Rust 原生技能库保存说明文档、数值特征、分群数、近邻数和历史数据标识；不把历史
结论当作新数据的证据。可查看已保存文档，再选择技能并填写新的参考、查询 CSV，
点击 **用当前 CSV 复用所选技能**。本次使用技能保存的参数，重新拟合参考数据、比较
近邻，并为第一条查询生成 FoKn 证据。下方手动参数不覆盖技能中的参数。

保存和复用沿用现有 NativeStudySession 请求编号、修订校验和断线重试流程。保存使
修订增加 1；复用依次提交配置、拟合、比较、证据四个阶段。后续阶段失败时，已完成
阶段可能已可见；使用原操作重试可继续执行。同名技能不会覆盖，不同笔记的技能相互
隔离。此入口是显式选择的技能保存与复用，不代表任意任务的自动技能生成已完成。

`tests/browser/native-procedures.spec.js` 使用真实本地 Rust 服务，覆盖保存成功后的
响应丢失、服务重启、原请求重试、新数据计算、FoKn 证据和笔记隔离；不需要模型或
EasyNet 线上配对。运行方式与上面的原生浏览器测试相同。

## 自动学习已完成的房屋分析

填写参考 CSV、新样本 CSV、特征、分群数和近邻数后，点击 **分群、比较并学习**。
不必先保存输入或执行分群。Rust 会提交配置，执行已有的五步房屋任务，再保存拟合、
比较和第一条查询的 FoKn 证据，共增加 4 次修订。只有整个操作成功提交后，才自动
生成技能。单独的数值计算成功、未完成的工作区阶段或失败调用不会被当作完成。

在 **可复用研究技能** 中，自动学习与手动保存有不同来源标签。自动技能的说明文档
保留实际数值参数，**查看已提交的执行记录** 展示五个已提交调用的操作和摘要；文档
作为文本显示，不自动获得工具权限。同名但不同来源的技能独立选择，复用将使用其
原始参数和当前填写的新 CSV，通过现有原生流程重新产生测量与 FoKn 证据。

计算、工作区保存和完成回调都有原请求恢复路径：比较失败后不重做已提交的拟合；
生成技能的回调失败后只重试回调。普通读取不会生成技能或任务事件。每个技能库最多
64 个名称，两个来源合计最多 128 条；内核观察日志的容量与结果大小限制继续生效。
重启测试使用同一编译程序，源码升级不自动迁移旧检查点。

`tests/browser/native-procedures.spec.js` 的自动学习场景实际丢弃完成响应、重启 Rust，
核对相同请求恢复后只有一份技能，再用修改过的 CSV 复用，检查新的参考标识、零距离
近邻、特征贡献与笔记隔离。此功能不等于任意任务的自主算法生成或 EasyNet 自动发布。

## Executable sample evidence

**插入 FoKn 样本证据单元格** archives the saved reference and current query CSV,
then inserts one executable AAL cell with the selected features, cluster count and
neighbor count. Run it to recompute the comparison and inspect `sample_evidence`
for the **first query row**: measured facts, same-cluster conclusions and derivation
graphs. The cell uses the same Rust fact projection and rule as the study panel;
its AAL source performs the actual FoKn checks and inference.

Evidence includes the real execution UUID. New execution creates new evidence;
retry after a lost response or server restart returns the original proof. Publication
preserves edited cells and does not duplicate an identical generated cell on save
retry. This is an independent cell result saved with editor outputs, not a mutation
of the study panel's evidence or a shared live FoKn forest. The existing source,
execution and output bounds apply. The proof checks captured observations and
same-cluster membership; it does not establish causal or price predictions.

This action requires the ordinary Rust `web` build. Automatic permission review is
optional, using the `web,model` build and server-owned reviewer configuration below.

## Automatic review and waiting cells

Start the Rust server with `--features web,model` and append
`--auto-review /absolute/path/to/cell-reviewer.json`. Use AAL's
`demos/notebook/cell-reviewer.example.json` and `cell-review-models.example.json` as
configuration templates; fill in the actual provider/model, credential environment
reference and authorized task. No key is entered into the notebook or cell source.
This reviewer is independent of the optional agent model flag.

To use it, add `behavior` with `permissions "auto"` to the cell's Agent declaration,
for example to an inserted FoKn evidence cell. The source declaration opts into review;
the server does not force auto onto other cells. Host capabilities remain the same
closed native skill set.

A temporary reviewer failure displays **等待自动审核**. The frozen request remains
in sessionStorage through reload. Run the same cell again to continue with the same
invocation and approved decisions. Run All stops before dependent cells during this
wait. Denial is terminal. A changed reviewer/deployment terminates the old invocation;
the next Run starts a new one. Completed results can replay even when the reviewer
is offline. Editing source deliberately starts a separate calculation.

When an unchanged AAL cell still has a frozen pending request, Run first reads
`POST /aal-api/workspaces/{id}/executions/lookup`. A retained success or error restores
the exact result without another execution request, including after server/browser
restart. An `unconfirmed` lookup does not mean the cell never ran: the explicit Run
continues its original invocation through native replay. Lookup failure or an identity
mismatch retains the pending request and stops. Lookup and execution share the existing
75-second request deadline; there is no automatic polling or new invocation on failure.
This is local native cell recovery, separate from study-command retry and EasyNet's
signed history path. The browser housing-evidence test prohibits execution requests
while recovering the saved numerical/FoKn result.

Review workers are bounded to 60 seconds and reviewer HTTP calls to at most 45 seconds;
native browser requests now allow 75 seconds. Ordinary workers retain their 10-second
limit. An approval action, including its arguments, is limited to 64 KiB. Large FoKn
graphs remain available in result output; use a compact observation/conclusion summary
for reviewed shared-value publication. Oversized actions are rejected without truncation.
The browser handles `pending` separately from `ok`/`error` and only clears the frozen
request on a terminal response. Approval does not imply live model correctness or
online EasyNet admission.

## Inspect the study's current knowledge

In **房屋研究**, choose **查看研究知识** to read the workspace's effective FoKn
context without a model call. The view groups active knowledge by area/tree and
shows candidate/supported status, text and original Agent/invocation/step provenance.
Expand **完整知识快照** for the complete native response. This is the study workspace's
forest; individual collaborators and AAL cells retain separate knowledge.

The read identifies the native document and revision. Navigation, saved input changes
or a study command clear the observation; read again to inspect the new state. A
revision mismatch asks you to refresh the study first. Unsaved form edits are not
included. If the connection fails, the same button starts a fresh read. No browser
knowledge copy or mutation retry command is created.

After changed inputs expire the sample facts, a fresh read omits them while the
existing sample-evidence view keeps the historical graph marked expired. Candidate
text remains unverified; supported means the attached assertion/calculation passed,
not universal truth. This view is not an entire model prompt or a signed EasyNet receipt.
The native 64-KiB query bound fails explicitly rather than truncating the forest.

The actual browser evidence test reads after lost-response recovery and Rust server
restart, compares the displayed full JSON with `/knowledge`, and verifies exclusion
after changed inputs. Unit checks cover identity/revision conflicts, failed reads and
late replies across navigation or active commands. Use a fresh native state root when
changing compiled application compositions, as for other native study changes.

## Revise housing explanation instructions

Open **与协作者讨论研究 → 调整房屋解释说明** after saving inputs and completing
similar-sample comparison. The current instruction is displayed as text with its
revision number. Enter feedback and choose **根据反馈修订说明**. The server uses
saved measured context, proposes an exact patch and commits the instruction with one
notebook revision. Subsequent DataMining discussions use the new instruction; numeric
results, saved recipes and historical replies remain unchanged.

This uses the existing pending-command session and response-loss recovery. Restarting
Rust without a model disables new feedback but permits retry of an already committed
proposal or result. An intervening notebook/instruction edit rejects an older proposal;
refresh before submitting a new request. Feedback is bounded to 8192 Unicode characters.
New notebooks own separate default instructions. Model-proposed wording is not proof
of improved explanation quality. `native-instruction.spec.js` exercises actual Rust,
HTTP requests, response loss, server/browser restart, later guidance reuse and isolation.

## 研究命令只读恢复

`NativeStudySession` 在显式重试已有操作时先调用
`POST /aal-api/workspaces/{id}/commands/lookup`，发送原来冻结的完整请求。
Rust 从内核持久化记录核对调用身份、参数和部署；尚有任务或恢复回调待交付时，
结果仍是 `unconfirmed`。进度观察不能替代这份完成记录。

`completed` 会跳过 `/command`，重新读取当前研究状态后才清除 pending 请求，
因此不会用旧结果覆盖后来更新的视图。`unconfirmed` 允许本次显式重试继续提交
同一个原请求；查询失败、响应损坏或身份不匹配会保留 pending 并停止，不回退到执行。
查询期间关闭面板也不会继续提交命令。初次执行仍只发送一次 `/command`。

支持的研究命令启用既有内核 root 结果持久化：最多 256 个调用，每个结果不超过
256 KiB，journal 不超过 8 MiB；普通状态读取不占调用记录。达到上限后需使用新的
研究命名空间，不会自动删除历史并重新执行旧操作。早于该机制的操作可能返回
`unconfirmed`，只能经原有显式重试恢复，不能据此认定从未执行。

浏览器验收已将丢失讨论回复后的 `/command` 端点直接拦截：关闭模型服务、重启
Rust 和刷新页面后仍能恢复原操作；历史讨论只有一条，模型请求只有一次。HTTP 测试
还覆盖分群、相似样本和 FoKn 证据的四个结果，以及只读快照、参数冲突和笔记隔离。
