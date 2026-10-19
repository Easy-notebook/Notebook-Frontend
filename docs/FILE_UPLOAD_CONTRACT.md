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

Concurrent upload ownership remains a separate lifecycle concern: the existing
utility still receives mutable UI callbacks and an abort-controller reference.
This contract migration does not establish cancellation or publication ordering
between overlapping requests.
