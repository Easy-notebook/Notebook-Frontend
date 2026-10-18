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

The persistence/autosave/session gate passes 141 tests across eleven files. Coverage includes
atomic repository writes, connection ownership, revision barriers, scoped fair
scheduling, retry deadlines, shutdown, pause and authoritative store publication.
Scheduler tests use deferred writes and virtual time; repository/provider tests use
transaction and IndexedDB event doubles. These are not native browser recovery tests.

Autosave lint passes without warnings. Full-project type checking still reports
305 existing diagnostics, none in autosave, persistence or session modules.

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
operation errors. Fifteen session regressions cover ownership, retries and load publication. Connection
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

## Remaining lifecycle work

Pause waits for quiescence and is not guaranteed to finish under an infinite stream of accepted edits;
application-level producer cancellation remains relevant. Cross-window conflicts,
native recovery and application/browser exit wiring remain. Browser termination
cannot guarantee awaiting asynchronous writes. No crash-durability or cross-session
version guarantee is claimed.
