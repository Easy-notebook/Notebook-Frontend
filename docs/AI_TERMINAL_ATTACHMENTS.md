# AI terminal attachment admission

`AttachmentUploadService` owns validation, notebook admission, batch upload and attachment
construction. `AITerminalService.uploadFiles` delegates to it while retaining the terminal's
public method and validation-limit properties.

The selected file array is captured and every extension/size checked before side effects.
An empty selection does nothing. Concurrent batches share a pending notebook initialization;
failed initialization releases the pending operation for retry. A newly created notebook is
adopted only if no other notebook has been selected, preserving existing draft content.
The captured notebook must still be selected after initialization, kernel admission and upload.

One multipart request carries the validated batch and its explicit file limit. Backend rejection
throws instead of silently omitting attachments. Object URLs are allocated only after successful
upload and owner verification. If construction fails partway through, already-created URLs are
revoked. Successfully returned attachments transfer URL ownership to their caller.

Tests mock network and Store boundaries and cover whole-batch validation, shared initialization,
single-notebook upload, changed selection, backend/kernel rejection, selected-array mutation,
retry, empty input and partial URL-allocation cleanup. No live upload is performed.

Remaining boundaries: caller draft removal/submission/unmount must manage returned attachment
URLs and UI publication. Owner checks compare the current notebook ID at async boundaries;
they are not an epoch check for switching away and back to the same ID. A failed UI admission
does not undo a notebook or files already created on the server. A single multipart request
does not establish backend batch atomicity.
