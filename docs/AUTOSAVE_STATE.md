# Authoritative autosave publication

The service owns save state. Zustand projects the complete frozen state attached to
each event; it does not infer clean/dirty state from event names. Store bindings can
be unsubscribed, and the application's binding is released on Vite hot disposal.
The unused internal `setDirty` action was removed: queued snapshots determine dirty
state. Error dismissal is a service operation shared by all projections.

## Commit boundary

The current snapshot writer stores notebook metadata, activity, file metadata and
file content in one repository transaction. FileRecordSet prepares and writes the
same file representation for standalone file saves and notebook snapshot saves.
Access metadata updates and content reads use transaction-owned records so they
cannot overwrite a concurrent save with a stale record.

After the write succeeds, the queue removes only the revision actually committed.
The service then publishes save_completed with that revision and the resulting full
state. If a newer revision is queued, every completion observer still sees dirty.
lastSavedAt is the commit acknowledgement time, not the snapshot creation time.
Loading another notebook does not clear pending saves. Clearing one queued notebook
preserves the pending count for all others.

Notifications are delivered FIFO. A listener submitting an edit during notification
cannot make a later listener regress to the previous state. Each event's state is
immutable; status-change notifications carry the same complete transition snapshot.

## Verification (2026-10-19)

The persistence/autosave/session gate passes 156 tests across twelve files. Coverage includes
atomic repository writes, connection ownership, revision barriers, scoped fair
scheduling, retry deadlines, shutdown, pause and authoritative store publication.
Scheduler tests use deferred writes and virtual time; repository/provider tests use
transaction and IndexedDB event doubles. These are not native browser recovery tests.

Autosave lint passes without warnings. Full-project type checking still reports
299 existing diagnostics, none in autosave, persistence or session modules.

## Per-notebook save state and revision barriers

NotebookSaveQueue now owns each notebook's scheduled/writing/retry_wait/blocked/clean
transitions, latest snapshot, in-flight revision and committed revision. Progress
snapshots are immutable and available through getSaveProgress and notification
progress. A successful save of another notebook does not clear this notebook's
blocked progress or error. The existing global status/error remain a last-operation
projection; consumers needing notebook-specific truth must use its progress.

saveNow captures its accepted revision and waits through flushThrough. This barrier
resolves when that revision, or a newer coalesced snapshot, commits; edits accepted
afterward do not extend it. A failed stale snapshot can be replaced by a newer one
without rejecting the barrier prematurely. Retry exhaustion rejects pending barriers
and retains the snapshot for a later explicit retry. Invalid/future revisions reject
without scheduling I/O. An already committed barrier does not trigger another save.

Explicit discard rejects affected barriers and cannot discard an in-flight write.
Queue teardown rejects remaining barriers. The queue retains one progress entry per
encountered notebook until discard/clear, plus only pending/latest snapshots and
live barrier waiters; it does not keep an edit history. Revision numbers are local to
the service instance and are not persisted or a cross-window concurrency protocol.

## Graceful service shutdown

The service lifecycle is separate from individual notebook save phases:
active -> closing -> disposed. dispose() is now awaitable and idempotent while in
progress. It stops new admission synchronously, cancels automatic scheduling,
flushes previously accepted edits, waits for accepted reads/initialization and closes
its persistence connection. Only then does it publish disposed and release observers.
An accepted save remains valid even when its enqueue observer requests shutdown.

A save or connection-close failure rejects disposal and restores active admission;
unsaved snapshots are retained for retry. New writes, reads, initialization, pause,
resume and discard operations cannot enter while closing/disposed. Service
references remain terminal after disposal, including the singleton reference.
Singleton reset is an explicit asynchronous test teardown:
it discards pending edits but still waits for in-flight I/O and connection closure.
It is not the production shutdown policy.

## Pause admission and scheduling ownership

Scheduling now has its own running/pausing/paused state, independent of the latest
read/write status and the service lifecycle. Loading or manually saving while paused
does not resume automatic admission. queueSave rejects while paused instead of silently
dropping a submitted edit; resume explicitly restores scheduling. Session switching
and paused UI selectors use this authoritative state rather than the latest I/O status.

pause coalesces concurrent requests and continues accepting newer edits while draining.
It rechecks the queue after awaiting each drain; once empty, it closes automatic
admission synchronously without an intervening await. It no longer clears queue/history
as a substitute for saving. Supplied snapshots are captured before observers can submit
newer changes. resume during a pending drain rejects instead of racing its completion.
Failure restores the previous scheduling mode and retains pending data. An overlapping
failed disposal also leaves scheduling recoverable rather than stuck in pausing.

## Shared writer and scoped drains

NotebookSaveScheduler owns drain requests and the single writer. Each request covers
one notebook or the whole queue; an empty targeted drain does not write unrelated
pending notebooks. Among eligible notebooks, the least recently served gets the next
attempt. Targeted and full drains share this arbitration, so a continually edited
notebook cannot consume the writer exclusively. One in-flight write is never preempted.

Retry budgets and readiness deadlines belong to each notebook revision. Waiting for
A's retry permits B to write. Admission wakes a sleeping scheduler, and a new revision
bypasses its predecessor's backoff. Overlapping requests share the retry budget;
exhaustion rejects only requests covering that notebook and retains its snapshot.
An explicit subsequent request can retry it. Full drains continue other notebooks
before reporting failure. Debounced admission also participates while a writer is active.

waitForComplete observes currently active requests, preserving their failures without
admitting unrelated pending work. Internal teardown waits for the worker itself, wakes
retry timers and stops further attempts after the current write finishes. Discard and
normal idle completion release retry timers. The scheduler performs no persistence
serialization or UI publication; those responsibilities remain in AutoSaveService.

## Session boundary

Switching notebooks flushes the departing notebook by queue identity, without waiting
for unrelated saves or requiring the editor to still show that notebook. Disconnect
submits a final editor snapshot only when its ID matches the active session; otherwise
it drains already accepted snapshots without relabeling another notebook's content.

A failed pause keeps the session identity and reports a session error, allowing a
subsequent disconnect to retry persistence. A failed departure flush restores the
previous session phase before loading begins. Successful connection clears stale
operation errors. Twenty-two session regressions cover ownership, retries and load publication. Connection
success uses a fresh post-load store snapshot and verifies its notebook identity.
A false loader result rejects before publishing connected/loaded; a partially updated
store carrying an error is not reused as a successful cached load. Cached and loaded
connections share one success-publication path.

## Session state projection

Session events carry complete immutable service state, delivered FIFO even when a
listener clears an error during notification. The Zustand binding copies these
snapshots instead of reconstructing identity/status from event names. It initializes
from current service state, exposes explicit unsubscribe and releases its default
subscription on hot disposal. Commands delegate directly to the service, including
error dismissal; their rejected promises do not overwrite a newer published state.
Initialization failure and invalid IDs also publish service-owned errors. A successful
initialization retry clears the error, and successful connection records its timestamp.

## Session transition ownership

The session service serializes initialize/connect/disconnect/switch commands in
admission order. Each command includes its storage work and state publication;
internal switch-to-connect composition does not reacquire the queue. The departing
identity and same-notebook checks run when the command gets its turn, not when an
earlier transition may still be pending. A rejected command releases ownership while
preserving the caller's rejection. Commands submitted by event observers join the queue.

This service boundary protects direct callers as well as route navigation. The route
coordinator still coalesces pending destinations before dispatch; the service does not
drop commands already accepted through its public API. Seven deferred/concurrent
regressions cover switch order, pause-before-resume, duplicates, failure recovery,
return navigation, observer submissions and initialization deduplication.

## Browser page lifecycle

AppContent mounts a disposable AutoSavePageLifecycle binding. Hidden visibility and
pagehide request an immediate flush of accepted snapshots; edits accepted while
hidden also request a flush. Concurrent signals share an in-flight flush. A
beforeunload handler is attached only while authoritative dirty state is true and
removed after commit/discard. Failed saves retain dirty protection and report errors.

The binding never pauses or disposes storage when a page is hidden or React unmounts.
It removes only its own listeners, leaving independent unapplied-source-draft guards
intact. Cleanup cancels a flush not yet started; accepted writes remain owned by the
service. Eight EventTarget tests cover dirty guard updates, coalescing, failure/retry,
hidden edits, shutdown admission and cleanup/remount ownership.

The visibility trigger follows [MDN visibilitychange guidance](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).
EventTarget tests alone do not prove native dialog behavior. The Chromium suite
below adds that check; bfcache restoration and asynchronous completion during
browser/process termination remain unproven.

## Native Chromium verification

`npm run test:browser` runs eighteen isolated Playwright cases against production modules:
page reload persistence, native multi-store rollback, accepted-transaction draining
on close, retry after a blocked upgrade, normal browser-process restart with a temporary
profile, and the native unsaved-exit dialog followed by successful save/reload after
cancelling navigation. The runner starts its own Vite server and never uses a personal
browser profile. Setup and exact limits are in [the browser test README](../tests/browser/README.md).

These results add real IndexedDB/browser evidence to the 156 Vitest cases; they do
not claim crash/power-loss durability, bfcache behavior or other browser engines.

## Non-destructive database upgrades

Database version 3 retains the existing database name and records, and reconciles
missing stores/indexes through one NotebookDatabaseSchema implementation. Both the
provider and the existing ORM connection manager use it. Unknown stores are retained;
upgrades never delete existing stores. The old manager's automatic deletion of other
historical databases has also been removed. Its connections now release on versionchange.

Native tests seed v2 data and verify preservation through both entry points, including
previously missing split-files storage and notebook indexes. A conflicting unique index
aborts the version upgrade and preserves v2 records; no automatic data-loss repair is
attempted. Remaining raw-handle configuration/cache callers still use the old connection
manager and must be migrated before connection ownership is fully unified.

## Atomic split-file cache clearing

SplitFileRepository clears one notebook through its notebookId index within one
readwrite transaction. Whole-cache clearing uses the native store clear operation
inside one transaction. Neither path enumerates records in one transaction and deletes
them later through independent transactions. Subsequent writes therefore run after
the clear transaction, and any failure rolls back the complete clear operation.
Native cases verify preservation of other notebooks, a concurrently admitted refresh,
and rollback of both scoped and whole-store deletion.

## Notebook ORM retirement

All internal notebook ORM callers now use NotebookRepository through the shared
storage persistence owner; LibraryService uses its already-injected repository.
The duplicate notebookOrm implementation and exports are removed. Storage helper
functions retain their application-facing signatures, and StorageManager.close now
also awaits the shared repository connection closing.

Activity recording, inactive-notebook queries, counter adjustment and recomputation
live in the repository. Statistics query notebook-indexed metadata and activities in
one readonly transaction. Counter updates and recomputation complete only on transaction
commit; no timeout can turn a pending write into success. Three native cases verify
concurrent counter increments, notebook-scoped statistics/retention, and rollback of
failed adjustments/recomputation. Configuration and legacy cache maintenance still require
migration; this change does not claim all raw connections have been retired.

## File ORM retirement and accounting

All internal file ORM callers now use FileRepository; the duplicate fileOrm module
and its exports are removed. Storage maintenance/imports reuse the existing persistence
singleton, and the extra storage composition instance is removed. Application FileCache
helpers retain their callable shape. Save inputs require file fields while allowing
callers to carry additional preview properties.

File creation/replacement, content changes and deletion commit metadata, content,
notebook counts/bytes and activity together. Reads update file/notebook access state
and activity under the same transaction. Large-file queries use the notebook index
when scoped and filter flags after reading; they never use invalid boolean IDB keys.
Old compression functions were identity operations, so historical payloads remain
readable as plain content even when marked compressed. Native cases exercise that
format, remote references, accounting across mutations, and full rollback on failure.

## Remaining lifecycle work

Pause waits for quiescence and is not guaranteed to finish under an infinite stream of accepted edits;
application-level producer cancellation remains relevant. Cross-window conflicts,
crash recovery, native application close coordination and broader browser lifecycle validation remain. Browser termination
cannot guarantee awaiting asynchronous writes. No crash-durability or cross-session
version guarantee is claimed.
