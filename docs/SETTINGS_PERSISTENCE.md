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

Four Web Crypto unit tests cover concurrent first use, failed-load retry, storage
reset between operations and empty values. A Chromium test checks that all concurrent
ciphertexts remain readable after page reload. This owner coordinates one application
instance; cross-tab first-use coordination is not implemented here.

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
existing API; callers needing acknowledged durability must use the storage promise.

Backups retain the existing raw-settings format and are wrapped into the correct
Zustand envelope on recovery. The backup manager skips malformed JSON/payload records
while searching newest-first. Primary read/decryption failure attempts backup recovery;
without a usable copy the error propagates. Reading a backup does not overwrite a
corrupt primary record. Backup creation remains best-effort under the existing manager.

A quota retry prunes only old settings backups. Settings writes no longer call the
broad legacy cleanup that deletes other `easy-notebook-*` records. The explicit cleanup
hook remains available with its existing behavior. Removed duplicate retry/rehydration
fallback logic, corrected timestamp placement, and retained v0/v1 migration defaults.

## Validation and remaining scope

Unit tests cover the real Zustand envelope, encryption isolation, deferred write order,
removal ordering, retry, backup recovery and quota preservation of unrelated data.
Chromium exercises credential update/reload, recovery without a primary record, and
v0 migration without double encryption.

The envelope/credential guard is not a complete settings-field schema. Future-version
migration policy, cross-tab writer coordination, failure-state presentation for synchronous
preference actions, and broader backup lifecycle improvements remain separate work.
