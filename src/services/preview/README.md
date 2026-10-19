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
