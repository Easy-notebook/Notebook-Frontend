# Settings persistence boundaries

## Encryption key ownership

`EncryptionKeyProvider` in `src/utils/encryption.ts` owns one in-flight key load per
application instance. Concurrent calls share that promise instead of independently
generating keys and overwriting `enc_key`. Both success and failure release ownership;
subsequent operations re-read storage, so a completed operation does not leave a
permanently cached key after storage reset.

The AES-GCM algorithm, 12-byte IV, Base64 payload layout and persisted key format
remain unchanged. Typed-array buffers retain their inferred ArrayBuffer-backed types
at the Web Crypto boundary, without BufferSource assertions.

Missing-key initialization acquires the origin-scoped Web Lock
`easy-notebook:encryption-key`. The owner re-reads `enc_key` after acquisition, then
imports the winner's key or generates and persists one before releasing the lock. Existing
keys can be imported without initialization ownership. If Web Locks is unavailable,
first-time key creation fails instead of silently permitting competing initializers;
existing-key reads remain available. No local-only initialization fallback is used.

Seven Web Crypto unit tests cover concurrent first use, failed-load retry, reset, empty
values, unavailable coordination and re-reading after ownership acquisition. Chromium
checks same-tab concurrency plus a deterministic two-tab race: the first generator is
paused, the second is observed waiting for the lock, and both ciphertexts remain readable
from both tabs after reload. Coordination is cooperative: old/uncoordinated clients and
external key deletion/replacement are outside this guarantee. This does not serialize
settings-record writes or implement multi-tab preference conflict resolution.

The lock lifecycle follows the [Web Locks specification](https://www.w3.org/TR/web-locks/):
exclusive ownership lasts until the initialization callback settles.

## Settings adapter

`SettingsPersistenceStorage` implements Zustand's actual `StorageValue<PersistedState>`
contract: the primary JSON record contains `{ state, version }`, with preferences
inside `state.settings`. Runtime settings keep plaintext API keys. Encryption occurs
on detached snapshots at the storage boundary; reading primary records or backups
uses the same decryption path. Browser File/IndexedDB persistence is independent.

The adapter serializes admitted writes, reads and removal through one promise chain.
Inputs are cloned before asynchronous encryption. A rejected operation does not poison
later work, and a removal cannot be overtaken by an earlier admitted write. API-key
updates await their persistence operation. Synchronous preference actions retain their
existing API. `SettingsUpdateController` observes every preference write and reports
asynchronous failures through the existing `error` state without swallowing rejection
for awaiting API-setting callers. A revision guard prevents a superseded write failure
from replacing the error state of a newer update. Synchronous validation still throws
synchronously. Runtime preferences remain optimistic on persistence failure.

Panel controls and error changes use the raw Zustand setter captured outside `persist`.
They never create backups or write preferences. This also prevents persistence errors
from recursively triggering another persistence attempt. All preference actions use the
same controller instead of duplicated synchronous try/catch blocks.

Backups retain the existing raw-settings format and are wrapped into the correct
Zustand envelope on recovery. `SettingsBackupRepository` owns discovery, retention and
newest-first candidate recovery. Every candidate must pass JSON parsing, payload validation
and decryption before selection; an unreadable ciphertext does not hide older usable copies.
Recovery leaves rejected records intact. Backup names advance beyond the newest stored
timestamp, so same-millisecond writes and clock rollback do not overwrite an earlier copy.
Retention considers only exact backup-prefix keys with safe integer timestamp suffixes. Primary read/decryption failure attempts backup recovery;
without a usable copy the error propagates. Reading a backup does not overwrite a
corrupt primary record. Backup creation remains best-effort under the existing manager.

A quota retry prunes only old settings backups. Settings writes no longer call the
broad legacy cleanup that deletes other `easy-notebook-*` records. The explicit cleanup
hook remains available with its existing behavior. Removed duplicate retry/rehydration
fallback logic, corrected timestamp placement, and retained v0/v1 migration defaults.

## Version admission

A primary record newer than the supported schema raises `UnsupportedSettingsVersionError`
before payload decoding. This error never falls back to an older backup. Migration also
rejects future versions instead of resetting preferences to defaults. Writes check the
current primary record before encryption, before backup creation, and immediately before
each primary commit, including quota retries. A newer record observed after asynchronous
work is preserved. Rejection does not latch the queue: externally repairing or explicitly
removing the record allows a later save.

These checks do not provide an atomic cross-tab compare-and-swap; another tab can still
write between a storage read and write. Backups already created before a version change
are not rolled back. Explicit removal remains an intentional deletion operation.

## Validation and remaining scope

Unit tests cover the real Zustand envelope, encryption isolation, deferred write order,
removal ordering, retry, backup recovery and quota preservation of unrelated data.
Chromium exercises credential update/reload, recovery without a primary record, and
v0 migration without double encryption, and future-version hydration/write rejection.
Unit tests also cover version changes during encryption, backup creation and quota retry,
unreadable backup candidates, timestamp collisions and foreign-key retention. Chromium
confirms recovery from an older encrypted backup when the newest ciphertext is invalid.

`SettingsRecord` validates all declared preference fields, nested objects, enum values
and finite numeric fields without coercion. Current primary records, backup candidates,
writes and runtime updates require complete settings. Historical primary records may
omit fields for migration, but supplied fields must already have valid types; migrated
results must pass the complete schema. Unversioned envelopes are admitted as version zero
so they cannot bypass migration. Unknown extension fields are preserved. Shared defaults
live in `SettingsDefaults`, independent of the Store.

This is structural validation, not a new URL/shortcut/business policy: string fields
retain their existing accepted domain. Cross-tab writer coordination, explicit save-status
UI beyond the existing error field, and broader backup lifecycle improvements remain
separate work.

Controller tests cover async rejection, synchronous validation and superseded failures.
Chromium verifies that transient controls cause no writes and a failed void preference
action reports its error with exactly one primary write attempt.

Schema tests cover malformed nested fields, enum values, non-finite numbers, historical
partial records and malformed primary recovery. Chromium verifies invalid current data
cannot hydrate and malformed runtime updates leave state and storage unchanged.

## Shortcut update policy

`ShortcutBinding` owns editable binding parsing and semantic conflict comparison.
Modifier order and letter case do not distinguish otherwise equal bindings. Repeated
modifiers are invalid. The existing Ctrl+C/V/X/A/Z reservation policy now compares
canonical identities consistently. The editable grammar accepts one or two modifiers
and an alphanumeric key or Enter; Enter matches built-in new-cell/run-cell defaults.
Stored display strings remain unchanged. This policy applies to the dedicated shortcut
update action; bulk import/update currently performs structural validation only.

Tests cover reserved combinations, modifier-order conflicts, malformed bindings, and
all built-in bindings. Chromium verifies rejected updates do not mutate state/storage
and the default Enter binding can be saved through the public action.

## Explicit maintenance

`SettingsStorageMaintenance` owns space estimation, a small storage capability probe,
and the explicitly requested cleanup operation. Its bound public methods remain usable
when returned and destructured by `useStorageManager`. A zero usage estimate is valid;
when no estimate exists, the probe restores any pre-existing probe record. Cleanup retains
the public selection policy (non-settings `easy-notebook-*` keys, least important/oldest
first, stopping after the existing size threshold). Automatic persistence never invokes
this broad cleanup. Metadata parsing is typed and non-numeric metadata sorts as zero.

Unit tests cover detached calls, zero usage, probe preservation, failure reporting and
cleanup ordering/isolation. Chromium exercises destructured methods from the public hook.
