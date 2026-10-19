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

## Outstanding adapter work

The settings store still declares a persisted payload where Zustand expects a
`{ state, version }` storage envelope. Its main/backup paths and encryption placement
need a dedicated follow-up refactor and hydration tests. The key-provider change does
not claim to resolve those settings-store lifecycle issues.
