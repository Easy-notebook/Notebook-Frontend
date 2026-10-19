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
