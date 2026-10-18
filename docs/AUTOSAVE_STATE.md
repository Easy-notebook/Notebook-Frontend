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

## Remaining lifecycle work

Graceful disposal while I/O is active, pause admission fencing, fairness of the global
writer under continuous edits, cross-window conflicts and native recovery verification
remain. flush still drains pending work, while flushThrough provides a fixed revision
boundary; pause currently uses the former and requires a separate admission protocol.
No crash-durability or cross-session committed-version guarantee is claimed.
