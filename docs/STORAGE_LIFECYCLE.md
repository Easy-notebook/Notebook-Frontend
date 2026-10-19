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
