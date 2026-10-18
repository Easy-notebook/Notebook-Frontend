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

The persistence/autosave gate passes 79 tests in six files, including seven store
projection regressions: edits during writes, unrelated notebook loading, partial
queue discard, failed writes, complete pause publication, reentrant edits and
initialization failure. Repository tests use transaction doubles; provider tests use
IndexedDB event doubles. These are not native browser durability/recovery tests.

Targeted lint completes with zero errors and existing any-type warnings in storage
interfaces/repositories. Full-project type checking is tracked separately; it is
not asserted to pass.

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

The persistence/autosave gate passes 94 tests across eight files, including six
queue transition tests and new service-level deferred-write barriers and independent
failure-state checks. Existing pause and multi-notebook writer tests also pass.

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

The combined gate passes 102 storage/autosave tests, including eight shutdown cases:
pending initialization, reads and writes, newer accepted edits, failed save recovery,
failed connection-close retry, explicit test teardown and notification reentrancy.
These remain deterministic service doubles, not native application exit tests.

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

The combined gate passes 108 tests including six pause regressions: edits in the
writer-to-pause microtask window, loads/manual saves while paused, concurrent pauses,
failed pause recovery, enqueue observers and overlapping failed shutdown.

## Remaining lifecycle work

The global writer still needs fairness under continuous edits. Pause waits for
quiescence and is not guaranteed to finish under an infinite stream of accepted edits;
application-level producer cancellation remains relevant. Cross-window conflicts,
native recovery and application/browser exit wiring remain. Browser termination
cannot guarantee awaiting asynchronous writes. No crash-durability or cross-session
version guarantee is claimed.
