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

Remaining boundaries: upload-service owner checks compare the current notebook ID at async boundaries;
they are not an epoch check for switching away and back to the same ID. A failed UI admission
does not undo a notebook or files already created on the server. A single multipart request
does not establish backend batch atomicity.

## Draft resource ownership

`AttachmentDraft` owns returned URLs while they remain in the terminal draft. Removing an
attachment, resetting for another notebook, or detaching the UI releases unsubmitted resources.
An epoch prevents old uploads and submission completions from changing the current draft.
Concurrent uploads have a count, so completing one cannot hide another's upload indicator.
The input and drop handlers share the same upload path; the input resets at selection time.

Each submission captures and pins its own attachment snapshot. An accepted submission removes
only those attachments, preserving new uploads. Failure retains the current draft for retry.
Removal/unmount during submission defers release until the last pin is settled. Once the AI
service creates the QA/action record, its optional `onAttachmentsCommitted` callback transfers
resource ownership. This occurs before subsequent memory/backend processing can fail. Built-in
commands that consume no attachments create no record transfer, so accepted unused attachments
are released. Settlement is idempotent and old epochs cannot publish into a newer draft.

`useAttachmentDraft` binds attachment cleanup to React layout lifecycle and committed notebook
changes, including StrictMode replay. A null-to-first-notebook transition preserves the draft
because attachment admission can create that notebook. Tests cover reset/unmount, late results,
concurrent uploads/submissions, retry, record transfer before later failure, and snapshot clearing.

Record-owned URLs intentionally remain alive after draft clearing. Final release on QA/action
removal still belongs to the message-record lifecycle and remains outstanding. Text-input
submission and the global terminal loading indicator retain their existing lifecycle.
