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
that has already started owns its own internal state updates. Component unmount/notebook
switch invalidation and the separate list-fetch lifecycle are not implemented here.
