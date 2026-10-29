# Native AAL file explorer — 2026-10-29

## Scope and ownership

The file explorer now queries the real Rust AAL `FileSystem` via the existing
native Notebook HTTP service. The previous title-derived `.easynb` placeholder
has been removed. `NotebookFileSync` belongs to the active Notebook lifecycle,
not to the visibility of the file panel. It mirrors current structured content
into `/work/notebook.easynb`; first initialization seeds `/source/original.easynb`.
This source is the first browser document snapshot, not a claim that the original
imported disk file was mounted byte-for-byte.

`/source` is read-only; `/work` writable with CAS; `/output` create-only;
`/tmp` writable scratch. The native adapter fixes the owner and authority; request
bodies cannot configure grants or host paths. The existing study CSV archive is
preserved as a separate read-only native `/datasets/<version>/<name>` projection,
with an independent Store change token. It is not a writable VFS mount.

Agent backup/read/list tools now use the same native `/output` store. A one-time
migration script, `scripts/migrate-notebook-artifacts-to-vfs.ts NOTEBOOK_ID`, can
copy old disk artifacts after the notebook has initialized; it preserves originals.
The runtime no longer writes or reads the old artifact directory.

## Detection and performance

- Visible file sessions check version cursors every 2 seconds, with no overlapping
  periodic request; hidden documents pause checks, focus performs a check. This
  is bounded conditional polling, not OS filesystem notifications.
- AAL persists a bounded 256-change metadata journal. Upserts/removals are filtered
  through the same owner/path permission index. An expired cursor gets a full reset.
- The Store cache is validated under its lease. 1,000 unchanged catalog queries
  perform zero snapshot reads in the instrumentation test. External cooperating
  writers invalidate it via native file identity.
- Tree updates invalidate changed ancestors and preserve unrelated subtree identity.
  WeakMap projection avoids rebuilding unchanged Ant Tree nodes. Fixed-height rows
  use virtual scrolling; the sidebar supplies the actual available height.
- Warm idle checks are O(1) in managed bytes/file count. Delta lookup is bounded by
  the journal plus ordered path lookups; initial/reset enumeration is O(F). Frontend
  branch updates still copy/sort affected sibling arrays. Backend mutations still
  serialize an atomic content snapshot O(B), not a block filesystem. Native cache
  retention is limited to four workspace snapshots. Current VFS limits remain
  2 MiB/file, configured partition quotas, and 2,048 retained mutation receipts.

## Real workspace evidence

Workspace: `9977eedf-8bfb-44bc-83b3-95af250eb3e6` (the annotated notebook).
Native source snapshot: 675,928 bytes. Created `/output/导入时备份.easynb` by native
revision-checked Copy; paged complete reads prove exact equality with source.
Original SHA-256: `bc3fe7fe632430c0d9ac51a23d4bcefe0bb508d5ed4e4b08bdb766ba4b5c7cd4`.

100 sequential local idle HTTP requests averaged 1.98 ms, 54-byte JSON responses.
This is a local measurement for this document, not a general throughput guarantee.
New backup appeared in the actual browser without pressing Refresh.
A separate `/tmp/文件变化验证.txt` exercises creation, replacement and removal;
only that disposable test file is removed after verification.

## Checks

- AAL VFS: 21 tests, including owner visibility, read-only ceilings, cross-instance
  commits, zero idle content reads, bounded cursor reset, and prefix-range siblings.
- Native application file endpoints: initialization, source preservation, CAS and
  independent CSV change detection.
- Frontend: native transport, multi-page read consistency, cancelled stale refreshes,
  immutable snapshots when unchanged, metadata deltas, subtree identity, debounce,
  stale synchronization conflicts, selected-file preview and acknowledged actions.
- Agent artifact adapter uses the native create-only output partition.
- Global frontend `tsc` has pre-existing errors in unrelated editor/UI/stream code;
  it is not reported as a clean project-wide type check. Agent TypeScript and
  touched-file diagnostics are checked separately.
