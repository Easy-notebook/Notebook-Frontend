# File upload contract

Editor drop/paste, block dragging, Jupyter uploads, and the file explorer use
`fileUploadClient` when calling `handleFileUpload`. The utility accepts only the
`uploadFiles` capability. Callers do not construct list, preview, download, or delete
methods to satisfy an upload dependency.

`FileUploadClient` owns the adaptation to the existing `FileService.uploadFile`
transport. `FileUploadConfig` describes the client validation limits and optional
target directory. The transport continues to own multipart encoding and HTTP errors;
the utility continues to own validation, progress, list refresh, and notification.
The notebook ID, directory, progress callback, and cancellation signal pass through
unchanged. Public transport endpoints and response shapes are unchanged.

Regression tests dispatch drop and paste events through a real TipTap editor and
exercise the actual upload utility with a mocked transport. They verify the shared
dependency, directory forwarding, progress, cancellation signal, refresh, and success
publication. They do not exercise a live upload backend.

## Shared-control lifecycle

`FileUploadAttempt` owns one request's controller and publication authority. Requests
sharing an abort-controller reference use latest-request ownership: replacing a request
installs the new controller before aborting the old one. Requests with separate references
remain independent. The existing cancellation button still aborts the current controller.

The normal transition is `uploading -> refreshing -> succeeded`. Active requests may
instead fail, be cancelled, or lose ownership to a replacement. Only the current request
may publish progress, errors, success, or cleanup. Ownership is checked after upload and
refresh awaits and between callbacks, including callbacks that synchronously start another
upload. Settlement releases only the request's own reference. Progress with no finite,
positive total is ignored; determinate progress is clamped to 0–100.

Cancellation is determined from the request signal even if the transport resolves or
uses Axios's CanceledError. Captured file arrays and configuration prevent caller mutation
from changing completion metadata. Tests cover late success/failure, replacement during
refresh, cancellation, reentrant completion, unknown progress, and independent controls.

Aborting HTTP does not guarantee rollback of files already accepted by the backend.
This lifecycle guards publications made by the upload utility; a list-refresh callback
that has already started owns its own internal state updates. File explorer refreshes
use the separate list-session lifecycle below.

## UI attachment and notebook ownership

`FileUploadControl` holds the notebook identity and the request slot. Detaching first
revokes the slot, then aborts its request; stale callbacks cannot start requests through
a detached control. React consumers use `useNotebookUploadControl`: each notebook gets
a separate control, and layout-effect cleanup detaches on a committed notebook change
or unmount. Effect setup reattaches for React StrictMode's setup/cleanup replay. The
file explorer resets upload presentation when changing notebooks.

The TipTap plugin keeps independent controls for each drop/paste request. A synchronous
Store subscription detaches pending controls on notebook changes; plugin destruction
unsubscribes and detaches all pending controls. Settled requests remove their controls.
Tests exercise real React lifecycle cleanup, stale starts, StrictMode, ordinary rerenders,
and real TipTap plugin destruction/notebook switching. React scope invalidation occurs
at layout-effect cleanup, rather than synchronously at every external Store mutation.

## File-list refresh ownership

`FileListSession` owns a single notebook's `idle/loading/ready/error` snapshot and the
current refresh request. A new refresh replaces and aborts its predecessor; late success
or failure cannot publish. Detach revokes ownership before aborting, and stale refresh
callbacks become no-ops. The React hook attaches and starts the session in a layout
effect; changing notebooks creates a separate empty snapshot immediately. StrictMode
reattachment starts a fresh request without reviving an old one.

Loading retains the current notebook's previous list. Current failures clear the list
and publish an error for the existing notification UI; a later refresh can recover.
Successful responses normalize directory children into a typed file tree. The transport
accepts an optional AbortSignal without changing existing callers. File explorer startup,
manual refresh, refresh events, upload completion and delete completion all use the same
session refresh. Tree rows derive directly from its snapshot instead of another state
copy, and loading preserves the DOM that owns drag/drop and resize listeners.

Tests cover out-of-order completion, stale errors, detach/reattach, reentrant detachment,
retry, directory normalization, actual transport signal forwarding, notebook switching,
and StrictMode. HTTP cancellation is best effort; identity checks also reject responses
from transports that ignore abort. This session governs file lists, not preview/download
requests or server-side mutation ordering.
