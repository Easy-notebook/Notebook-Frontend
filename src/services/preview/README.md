# Preview request ownership

`PreviewRequestLifecycle` owns publication rights for one replaceable asynchronous
request. The preview store creates its owner inside the Zustand initializer; no
request ticket is persisted or exposed as application state.

Transitions:

- `begin`: any phase → loading with a new opaque ticket.
- `settle`: current loading ticket → ready or failed; obsolete tickets do nothing.
- `cancel`: any phase → idle, invalidating the previous ticket.

Split preview checks ownership after cache reads and network responses, and settles
only after any required cache write has finished. A replaced request returns
`undefined`; it cannot publish a file, clear a newer loading indicator, or report
an obsolete error. Closing, resetting, or changing notebook context invalidates
split loading. Admission precedes the loading notification, so synchronous
subscribers can cancel before I/O begins.

Cancellation does not abort an already started HTTP request or cache transaction.
An admitted cache write may finish after cancellation; its result cannot reopen
the split preview. The existing public return type remains `FileObject | undefined`.
Normal previews use a second owner shared by notebook switching, tab discovery,
saved-tab restoration, and file activation. Public methods admit a request; their
private nested operations retain its ticket instead of admitting competing work.
The shared publication guard checks both before and after notifying subscribers.
This prevents a synchronous replacement from being followed by another write or
persistence operation from the obsolete request. Same-notebook refreshes are
separate requests, just like cross-notebook navigation.

Reset, explicit file/view selection, and tab closing supersede pending normal
loads. Tab removal is immediate; neighbor selection belongs to the close request
and cannot later republish an old tab list. Saved-tab misses can start default
discovery only while their original request is current.

Cache deletion, clear, and content editing use the commit completion rules below.

`src/store/previewStore.lifecycle.test.ts` exercises the real store with controlled
cache/network promises, including replacement, failures, close/reset, notebook
transitions, and reentrant subscription cancellation.

## Renderer content

`formatPreviewContent` is the single pure conversion boundary for newly fetched
normal and split preview content. File classification and MIME selection remain
owned by `storage/fileTypes`. Binary payloads become compact data URLs, existing
data URLs remain unchanged, and text/Excel payloads pass through verbatim. Empty
Word content stays empty. Empty PDF content uses the existing encoded
`/assets/{notebookId}/{basename}` route, relative to the supplied backend base.
The formatter has no browser, persistence, or request-lifecycle dependency.

Store integration tests assert both renderer output and cache payloads for PNG,
JPEG, SVG, PDF, DOC/DOCX, existing data URLs, empty content, and text/Excel files.

## Cache mutation completion

Cache deletion/clear admits a normal-preview owner, cancelling older normal loads.
The persistence operation continues even if navigation supersedes its view.
Its boolean result reports persistence success; only the current owner reconciles
tabs or publishes an error. Clearing a notebook removes only its tabs and dirty
flags and clears its active file; it never loads an unrelated remaining tab.

`FileRepository.clearNotebook` deletes target metadata/content and updates
notebook counters and activity records in one native readwrite transaction.
Single-file deletion and bulk clear use the same record deletion implementation.
Browser tests verify both successful isolation and complete abort rollback.

## Content edit completion

An edit captures its notebook/path and admits a normal-preview request before
writing. It uses the existing atomic `updateFileContent` contract: the repository
updates UTF-8 byte accounting and timestamps while retaining record ownership;
an already deleted file is not recreated. Navigation does not abort an admitted
write, but supersedes its permission to read back or publish into the view.

Only a current edit reads the committed cache record. `fileFromCache` projects
that record, using the same mapping as ordinary cached previews. A subsequent
navigation or edit prevents late readback from changing the active file. The
readback may observe a newer committed revision; it does not synthesize metadata
from the original UI snapshot. Missing/superseded results return `null`, and
storage failures still reject the caller's promise.

Native transaction admission already orders overlapping updates; browser tests
cover consecutive edits and deletion admitted before an edit. No additional
application write queue is used.

## Complete cache hits

`hasCachedContent` requires an actual string body and no remote-fetch requirement.
Metadata-only records, missing content records, and remote preview snippets must
fetch the complete backend body. An empty string is valid local content.
`fileFromCache` accepts only the narrowed complete-record type; it cannot silently
substitute an empty string for missing content.

File-ID loading forwards its already-read cache result to the private preview
operation under the same request ticket. This avoids a redundant read and access
counter update while retaining all publication and cancellation checks.

## Exact remote resource identity

`PreviewFileSource` owns a single remote read and validates the application-level
response. Normal and split preview pass the selected notebook ID and full path
unchanged. The transport sends that path in JSON; the preview layer does not add
asset prefixes, strip directories, encode the path, or recursively retry under
another identity. Failed lookup can therefore never silently open a different
file with the same basename.

The source preserves transport exceptions, including `HttpResponseError.status`.
Normal preview keeps the existing quiet failure for HTTP 404 and reports other
failures through its error state. Split preview continues reporting all failures.
Application-level errors are reported without guessing a status from message
text. Error handling never creates a cache record or a new tab for the failed
request, and obsolete requests still cannot publish errors.

## Atomic normal-preview activation

Cached and fetched preview activation share one store operation. It uses
`TabManagerService.addTab` to preserve tab order and update existing entries,
then publishes active file, renderer mode, tab list and loading state together.
Subscribers therefore cannot observe a newly activated file before its tab exists.
The request guard runs again after notification; a synchronous reset prevents
follow-up tab persistence from the obsolete activation.

Tab-manager operations are a static dependency (the service does not depend on
the store). The obsolete filename-specific localStorage cleanup is removed:
persisted state already restores only `dirtyMap`, ignoring historical tab fields.

## New preview record sizes

Both network loaders measure the UTF-8 bytes of the renderer content actually
written to cache. They do not use JavaScript character counts or the size of a
placeholder `File`. For binary previews this measures the stored data-URL
representation, not the original binary transfer size. This matches local
content-edit accounting; storage-budget usage remains independently measured by
`StorageUsage` and is unchanged.

Normal network previews use `saveFile`'s committed metadata through
`fileFromCache`, including cache/access timestamps and access count, rather than
synthesizing another metadata snapshot after the write.

## Saved-tab persistence outcomes

`TabManagerService.loadTabs` returns `null` only for an absent saved record.
Storage failures reject; the store reports a current restoration error without
running default discovery or writing a replacement state. A saved empty list is
valid and remains empty. Obsolete restoration failures cannot affect a new view.

Saved tabs and their active selection share one scoping rule on read and write:
only this notebook's tabs remain, and the active ID must be a member of that list.
Save/clear failures also reject. Explicit callers can observe the failed commit,
and a failed outgoing save prevents `switchToNotebook` from advancing preview
selection. Background activation/close snapshot saves retain explicit logged
rejection handling; they do not claim a successful persistence commit.

## File identity roundtrip

`storage/fileIdentity` owns the existing `notebookId::filePath` key format for
preview loading, tab discovery, canonical file records and split-file records.
Parsing splits only the first separator and never trims or decodes the remaining
path. Thus `report.txt` and ` report.txt ` remain distinct stored resources.
Incomplete IDs are rejected before file loading. The persisted key format is
unchanged and requires no migration.

Native browser coverage verifies that reads, content updates and deletes of the
whitespace-bearing key leave the similarly named canonical and split files intact.

## Independent default-tab discovery

When no saved tab state exists, local and backend catalogs are read independently.
`TabCatalog` validates each complete source, applies common tab exclusions, and
projects file identities. It preserves explicit remote paths and derives absent
child paths from their parent directory. Malformed source parsing contributes no
partial entries. Cached metadata wins duplicate paths regardless of completion
order, and foreign cached notebook ownership is excluded.

A nonempty catalog from either source remains usable when the other source fails;
that source's failure is logged. An empty result is returned only when both sources
succeed. Failures with no usable entries reject with `TabDiscoveryError`, retaining
source-specific causes, so the store can preserve current tabs and show the error.
`FileReadRecord` now types both single-file and notebook-list repository results.

## Metadata validation versus file availability

Tab discovery uses `validateTabMetadata` and does not require file bodies.
Existing path, system-file, temporary-file and notebook exclusions still apply.
Images and ordinary text names containing photo/Image/Screenshot are not evidence
of missing content and remain eligible for tabs. The former filename-based
missing-image heuristic and content-dependent discovery validator are removed.
Actual availability is resolved only when the file is opened, through the complete
cache-hit and exact remote-read contracts above.

## Split-cache write boundary

`SplitFileSaveData` defines the split-cache write shape. The repository rejects
missing identity/name/type/modification fields, non-string content, and negative,
fractional or unsafe numeric sizes before writing. Empty content with zero size
is valid. Optional metadata is opaque (`unknown`) and remains subject to the
provider's existing structured-clone snapshot at admission; no second cloning
layer is added. The persisted record shape is unchanged.

Native browser coverage verifies that malformed replacement writes and
uncloneable metadata leave the prior committed record and statistics intact.

## Tab snapshot write boundary

`TabEntry` names the persisted entry shape, and `TabRepository.saveTabState`
accepts a readonly list. Before any write it checks notebook identity, required
entry fields, exact ID/path agreement, duplicate IDs and active-tab membership.
An empty list with null active selection remains valid. The repository copies
entry fields synchronously so later caller mutations cannot change the snapshot.

This integrity check complements `TabManagerService`'s UI scoping policy: the
service filters foreign UI tabs, while the repository rejects inconsistent raw
snapshots. Browser tests verify invalid replacement and native commit failure
both retain the prior complete saved selection. The stored shape is unchanged.

## Editor callback identity

Editors pass an explicit `PreviewEditTarget` (surface and rendered file ID) to
`updatePreviewFileContent`. The store checks identity before admitting a request
or writing. The public `updateActiveFileContent` API delegates to the same commit
flow for normal previews and preserves its existing call signatures.

Both surfaces use the same save lifecycle, with independent request owners and
repositories. Split writes use an atomic read/update transaction against the
split cache, preserving record metadata and refusing to recreate deleted records.
Content size and modification time are assigned by the repository. Normal-tab
navigation does not revoke a split edit. Closing or replacing the target surface
revokes publication of an admitted write, but the captured transaction finishes.
Errors propagate, and missing records or obsolete results return null.

A null result is not a save acknowledgement. The spreadsheet retains its dirty
marker for rejected or obsolete results, and the tab wrapper no longer clears
markers merely on Ctrl/Cmd+S. These edits commit to local preview storage; no
backend file-upload operation is implied. Native browser tests cover split write
ordering, UTF-8 sizes, metadata preservation, deletion ordering and transaction
rollback. Store and UI tests cover target routing and late completion ownership.

## CSV serialization

The spreadsheet stores every source row in its data model, including any original
header row. A/B/C column labels are view coordinates, not file contents.
`CsvCodec` owns CSV parsing and serialization. `serializeTableCsv` projects cells in column order and uses Papa Parse to encode
CSV for both save and export. It preserves embedded commas, quotes, CR/LF and
Unicode, and normalizes null/undefined cells to empty strings while retaining
zero and false. Repeated CSV save/read cycles do not insert coordinate rows.
CSV export remains an explicit text conversion. Saving XLSX instead uses
`XlsxDocument`, which owns the parsed source workbook and writes base64 XLSX.
`readGrid` projects source cell records and merged ranges into one zero-based grid.
It preserves empty positions inside the used range and returns cloned cell records,
so editing a projection cannot mutate the retained workbook. Empty worksheets
produce an empty grid. Imported style keys use the same grid coordinates as values,
including worksheets whose used range starts away from A1. Merge coordinates are
normalized, but the flex renderer still does not implement complete merged-cell
spanning.

It projects the visible grid back at the source sheet's original range origin,
retains undisplayed worksheets and workbook properties, and preserves unchanged
cell records (including numeric/boolean types, number formats and formulas).
Changed cells replace their prior value/formula; shortened grids remove old
cells and merges outside the resulting range. Serialization clones the source
so failed or repeated saves do not mutate the read model. A failed source load
cannot save an empty replacement workbook.

User-applied bold, italic, underline, foreground/background colors and horizontal
alignment are passed from the current draft to `XlsxDocument.serialize`.
`xlsxCellFormat` translates these overrides into writer styles, preserves unrelated
available style fields and respects explicit false flags. Formatting unchanged
formula cells retains their formula. Tests inspect emitted OOXML style references,
including non-A1 source ranges, and exercise the toolbar-to-save integration.

`restoreWorkbookCellMetadata` reconnects the codec's parsed font/fill/alignment tables
with cell style indices from worksheet XML. Package relationships resolve worksheet
paths; sheet order is not used to guess filenames. Parsed numeric font flags become
booleans, and each cell receives its own style object. Package file buffers are
released after hydration. This adapter isolates the codec's undocumented parsed
table shape; codec upgrades must run its package and round-trip contract tests.

Imported toolbar formats initialize the draft baseline. The first click can remove
imported bold, and explicit false overrides the source presentation. Tests cover
three save/reopen cycles, retained worksheet styles, formulas, RGB fills, alignment,
and toolbar removal followed by saving and reopening.

This is not a full Excel editing engine; supported structural reference updates are
described below. Rich Excel features, custom theme rendering, borders and advanced style
inheritance are not fully covered by this adapter or the installed codec. Complete
Excel fidelity remains outside the verified behavior described above.

CSV parsing retains blank records and whitespace-only cells. It removes only the
synthetic final record produced by the parser for a trailing line terminator.
The encoder quotes empty cells explicitly so an empty final row is unambiguous.
Malformed quoted input fails admission to saving; both formats require a loaded
source matching the current file ID and content before a write is allowed.

## Spreadsheet edit ownership

`SpreadsheetEditSession` owns the source identity, draft revision, current save
ticket and last accepted commit echo. Data, columns and formatting commit together through `SpreadsheetHistory`,
which advances the revision before publishing a snapshot to React. Only the latest
save of an unchanged revision with matching committed content may clear the dirty
marker. Failure, different readback contents, another source, and unmount revoke
that acknowledgement.

The source effect distinguishes a save's own committed contents from a new source.
An owned echo updates the source baseline without reparsing the visible draft,
so edits made while the write was pending survive. File, preview-surface, format
or external-content changes still load the newly selected source. Unit tests
exercise both echo/promise orders, and a rendered-grid test inserts another row
while saving, publishes the earlier result, then saves the retained newer grid.

## Virtual spreadsheet row identity

`VirtualSpreadsheetRow` is the stable component passed to react-window. The live
row rendering function travels through `itemData` and is invoked as a render
callback, not installed as a new component type. Editing state can therefore
update without unmounting the row's input. The regression test first failed on
input DOM identity after one character; it now verifies identity, focus across
consecutive edits, and the final persisted CSV value. Virtualization is retained.

## Sorted spreadsheet coordinates

The grid resolves each rendered row through TanStack's source `row.index` for
editing, active-cell identity, cell formats and source values. Display positions
are not used to index the draft. `SpreadsheetRowOrder` owns the visible-to-source
projection for arrow navigation, rectangular selections, copy and paste. Selected
source rows are memoized once per projection/selection. Saving retains canonical
source order; sorting changes the view rather than rewriting the source file.
Regression tests cover selecting/editing a moved row, keyboard range copy and
multi-row paste after sorting, plus filtered row-order boundaries.

Clipboard reads are deferred edits owned by the same session. Admission captures
the current revision; another deferred edit supersedes it, and any draft change,
source change or unmount revokes it. Only the current successful completion can
apply its text, once. Accepted paste builds new row objects instead of mutating
the captured draft. Save echoes do not invalidate an otherwise unchanged edit.

## Spreadsheet component ownership

`DataTable` selects the preview source and keys `SpreadsheetEditor` by surface,
file ID and effective format. The editor owns its draft, save/deferred-edit
session, history, selection, input state, menus, filters and formatting. Switching
identity unmounts that complete owner instead of manually resetting a subset of
its state. The boundary is inside the exported spreadsheet component, so it does
not depend on a caller's file-only React key. `SpreadsheetSourceBoundary` also owns the edit session for each source generation.
For same-identity content updates, the session's pure `retainsDraft` admission check
preserves the mounted editor for unchanged content and owned save echoes. External
replacement creates a new session and remounts the complete editor. Its old session
closes on unmount, revoking pending saves and clipboard edits as well as clearing
menus, selections, inputs, history and view-local projections. This avoids manually
resetting a growing list of React states when the backing document is replaced.

## Spreadsheet history

`SpreadsheetHistory` is the single owner of the current grid snapshot and its
undo/redo cursor. Every value, column or formatting command commits a complete
snapshot; column structure and row data change atomically. Snapshots are cloned
and recursively frozen, so later draft mutations cannot rewrite history. Undo
and redo publish existing snapshots, and committing after undo truncates the
old redo branch. Up to 50 undo steps are retained. Source loading resets the
baseline, including empty documents, while an owned save echo keeps history.

History transitions notify the edit session before subscribers, preserving the
same revision checks for saving and deferred clipboard reads. The separate
React history array/index, pre-edit recording calls, skip-next-history flag,
JSON cloning and per-field revision hook have been removed.

## Spreadsheet structural edits

`SpreadsheetSnapshot` is a view-independent draft contract. `SpreadsheetStructureChange`
uses one row/column index transformation for values, canonical column keys and
user-applied cell-format coordinates. Insertions shift existing formats; deletions
remove formats on deleted cells and shift survivors. The complete result is one
history commit, so undo restores structure and formatting together. Structural
commands rebase the active cell and clear transient ranges/editing; undo/redo
clear transient coordinates that may not exist in the restored snapshot.

XLSX snapshots also own `SpreadsheetWorkbookState`: current merged ranges and a
mapping from grid positions to original worksheet cell addresses. The same index
transformation moves source identities and formats, drops deleted identities, and
expands/shrinks merged ranges. Empty and single-cell merges are removed. Undo/redo
restores this metadata together with values; the separate React merge state is gone.

Serialization reads unchanged cell records from their original identity, rather
than from their new destination address. Inserting a row/column therefore retains
numeric types, number formats and formula records even when adjacent displayed
values are equal. New cells cannot inherit destination formulas. Current merges
are translated back through the source worksheet origin when saving.

Snapshots retain an ordered structural change log. `transformSpreadsheetFormula`
rewrites ordinary A1 cells, rectangular ranges, whole rows/columns and absolute
references. Quoted strings, function/name tokens and structured-reference tokens
are kept opaque. Each save applies the log to the original workbook's formulas,
including qualified references from other worksheets and defined names; repeated
saves do not accumulate shifts. Undo restores the log with the rest of the snapshot.
Deleted single references become `#REF!`; ranges shrink to surviving coordinates.
The tokenizer's reference syntax is informed by the
[Microsoft XLSX formula grammar](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0).

Structural saves clear formula cached values throughout the workbook, including
indirect dependents and position-sensitive functions. The cell-metadata reader
preserves missing results instead of exposing the codec's synthetic zero. The
editor does not calculate formulas: reopened results remain empty until a
spreadsheet calculation engine computes them.

External workbook and 3D references are left unchanged. Array formula regions,
advanced structured-reference syntax and full Excel calculation semantics remain
incomplete. Advanced presentation beyond the supported draft formats and font metadata, and
full merged-cell layout, remain incomplete.

## Observable spreadsheet save state

`SpreadsheetEditSession` publishes immutable `ready`, `saving`, `saved` and `failed`
snapshots through `useSyncExternalStore`. The editor renders progress and failure
feedback directly from that owner; there is no duplicate React saving/error state.
A failed write retains the draft and can be retried with Save. Missing or mismatched
readback is reported as unconfirmed, rather than successful. Preparation failures
also appear in the view, before storage is called.

Only a current save of the current revision publishes `saved`. A draft change clears
that indication, and accepted saves with newer local edits return to `ready`.
Obsolete failures do not publish. Source replacement installs the new source before
notification, and save completion rechecks ownership after notifying subscribers;
a synchronous edit, close or new save cannot be followed by a stale clean marker.
The editor also checks admission after the saving notification before starting I/O.

The save button and editor-scoped Ctrl+S / Command+S share `handleSave`. Before
serialization, `commitEditingCell` commits any in-progress input to the history
owner and returns the resulting snapshot. Blur uses the same operation; an already
committed or unchanged value adds no history frame. Saving serializes that current
snapshot rather than a React render captured before the input commit. Cell elements
are focusable by mouse, and the editor handles save keys only within its subtree;
composition and repeated keydown events cannot accidentally submit another save.

Grid undo/redo, find, formatting and navigation also route through the editor's
React key handler. The former document keydown listener is removed, preventing
other page inputs or another preview surface from changing this draft. Editable
inputs keep their native editing keys; save remains an explicit editor-wide command.
Navigation does not consume toolbar button/link activation. Shortcut letters are
normalized so Command-Shift-Z redo works with the uppercase browser key value.

## Spreadsheet cell presentation

`SpreadsheetCellPresentation` is the typed view conversion boundary for normalized
workbook styles and draft format overrides. It consumes reader-resolved RGB values,
including resolved theme colors, rather than substituting a hardcoded theme palette.
The old flattened-fill aliases, alternate font flags and private CSS alignment
properties have been removed. Explicit false formatting overrides remain effective.
Font size uses points, matching the workbook style unit, and font family and vertical
alignment are applied to the rendered text container.

Imported presentations are indexed by original worksheet cell identity. Rendering
resolves them through the snapshot's current source mapping, so row/column changes
and undo preserve font presentation without leaking it into inserted cells or other
surviving cells. This does not add full border, row-height or advanced Excel layout
support.
