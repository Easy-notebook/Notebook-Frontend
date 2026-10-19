# IndexedDB connection lifecycle

`IndexedDBConnection` owns connection admission and accepted transaction lifetimes.
`IndexedDBStorageProvider` owns schema setup and maps repository operations onto that
connection. Public repository and storage method signatures remain unchanged; the
provider optionally accepts an IndexedDB factory for deterministic lifecycle tests.

## States and ownership

- `closed` and `failed` accept a new initialization attempt.
- `opening` shares one promise among callers. Only that attempt may publish `ready`.
- `ready` admits transactions without an asynchronous gap before registration.
- `closing` rejects new work and waits for accepted transactions to terminate.
- A version-change event closes the owned connection so another context can upgrade.
- Explicit close and unexpected database closure invalidate pending admissions.

IndexedDB open requests cannot be cancelled. Closing during opening rejects waiting
callers immediately, aborts any later upgrade callback, and closes a late successful
connection without installing it. A fresh attempt is independent of old callbacks.

## Transaction contract

Both reads and writes resolve only on transaction completion. A successful request
followed by transaction abort rejects the operation. All provider operations share
this boundary. A synchronous or asynchronous scheduling error aborts the transaction
and preserves its original error; close waits for the abort event.

Transaction callbacks must schedule requests synchronously or from IndexedDB
callbacks. Awaiting unrelated asynchronous work cannot keep a native transaction
alive. An error after commit cannot undo that commit. This existing callback contract
is not a general-purpose asynchronous transaction scope.

## Verification

On 2026-10-19, `vitest run src/services/persistence src/services/autoSave --maxWorkers=1`
passed 72 tests across five files, including 18 connection/provider tests. The latter
exercise injectable IndexedDB event doubles, not a native browser database.
Targeted ESLint and diff whitespace checks passed. Whole-project type-check reported
305 diagnostics, with none in the changed provider/connection/test files.

## Save revision ownership

The later autosave implementation adds per-notebook lifecycle ownership in NotebookSaveQueue:
clean, scheduled, writing, retry_wait and blocked. Each accepted snapshot receives a revision;
acknowledging an older in-flight revision cannot erase a newer queued edit. Revision barriers
resolve only when that revision or a newer coalesced snapshot commits. NotebookSaveScheduler
owns the single writer, scoped drains, fairness and per-revision retry backoff. NotebookWriteBaseline
retains the observed persisted body for conditional writes and does not silently rebase on retry.

Admission takes an independent structured clone before advancing the revision or replacing queue
state. Cells, nested outputs, metadata and tasks therefore cannot change when the caller reuses or
mutates its input during debounce, retry or conflict recovery. Each retry serializes the same accepted
data. Values unsupported by structuredClone are rejected at admission, leaving earlier pending
work and barriers intact. Circular data can be cloned but still fails JSON serialization at the write
boundary, retaining the pending revision for a later corrected edit.

This adds an O(snapshot size) traversal and temporary allocation for each accepted edit. No latency
or memory benchmark is claimed. There is still one latest pending snapshot per notebook, plus an
older in-flight snapshot when needed. Public save method signatures remain unchanged.

The admission-ownership gate passes 324 tests across 20 storage/autosave/session files, including
four new regressions for caller mutation, retry-body stability and clone-failure atomicity. These
are unit/integration tests with doubles and jsdom; they do not establish native browser durability
or cross-window end-to-end behavior. Historical verification counts below describe earlier phases.

## React initialization ownership

PersistenceProvider now waits for its preceding cleanup promise before initialization.
This matters during React StrictMode effect replay: the connection intentionally
rejects operations during closing. Cancelled effects cannot start a deferred opening
or publish late initialization results. Opening/ready/failed UI states expose a retry
path rather than leaving failed initialization as a permanent blank screen. Cleanup
rejections are observed even after unmount, and retries again wait for cleanup.

The combined storage/autosave gate passes 85 tests, including six provider lifecycle
component regressions (StrictMode, pending cleanup, late completion/rejection, failure
retry and cleanup failure). These tests use a mock service and jsdom, not a native
browser startup audit. Full-project typecheck remains at 305 diagnostics with none in
PersistenceContext; targeted lint has zero errors and the pre-existing mixed-export
Fast Refresh warning. Autosave shutdown and per-notebook state machines were implemented in later phases; see the save revision ownership section above.

## Pause admission

pause(snapshot) accepts and copies its supplied revision before creating a pause task or cancelling
the debounce timer. Queue admission itself invokes no observers. Once accepted, pause ownership
is installed before publishing the queued snapshot, so synchronous subscribers still share the
same drain and can submit newer edits safely. Rejected input leaves scheduling and existing
pending revisions unchanged; a rejected concurrent pause leaves the already-active pause intact.
The regression reproduced a rejected pause nevertheless reaching paused before this ordering fix.
The updated storage/autosave/session gate passes 326 tests across 20 files.

## Concurrent activity projection

AutoSaveActivity tracks independent read/write ownership for the public status projection.
A pending write takes precedence over reads; otherwise status stays loading until the last read
finishes. Each completion releases only its own token, including failure paths. save/load event
snapshots use the aggregate status, so a load_completed event may legitimately still report syncing
or loading. The event describes one operation; status describes current aggregate activity.
This does not change save revisions, transaction admission, retry backoff, or the independent
scheduling/lifecycle fields. It does not count time waiting for initialization or a scoped drain
as a started load. Three regressions cover concurrent reads and both read/write completion orders.

## Native verification of revision admission

The Chromium fixture now exercises these latest boundaries using the production AutoSaveService
and actual IndexedDB: accepted nested snapshot data survives a page reload; failed pause cloning
leaves the native database empty until a subsequent valid drain; aborting a native transaction
after its content request succeeds causes a retry with the identical accepted body and one final
file. All three tests in tests/browser/autosave.spec.js pass. The fixture uses an isolated browser
context and does not touch a user's browser profile. This verifies these scenarios in Chromium;
it is not a crash/power-loss durability guarantee or a cross-browser performance audit.

## Scoped drain failures and automatic retry admission

A targeted flush cancels the shared debounce timer, so its completion path must restore scheduling
for other eligible notebooks even when that flush rejects. This decision now lives in the shared
scoped-drain boundary rather than being duplicated in flush and queue processing.

Automatic debounce drains exclude revisions already blocked when that drain is admitted. An
unrelated edit must not silently retry exhausted writes or semantic conflicts. Explicit flush/drain
requests may retry blocked revisions; a newly queued edit creates a scheduled revision and is
eligible for automatic saving. Retry backoff within an admitted revision remains unchanged.

The regression uses deterministic timers: A fails or conflicts, B still saves after A's targeted
flush rejects, a later C edit does not retry A, an explicit A retry does attempt it, and a corrected
new A revision returns to clean. The storage/autosave/session gate passes 331 tests. All four native Chromium autosave scenarios
also pass, including this cross-notebook case: abort A after its native content request succeeds,
verify no partial A metadata/content, observe B and C commits without retrying blocked A, explicitly
retry A, then admit and read back a corrected A revision.
