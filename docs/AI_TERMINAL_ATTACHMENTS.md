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
Removal/unmount during submission defers release until the last pin is settled. The message Store acquires its own resource lease as soon as a QA/action record
references the attachment. Later memory/backend failure cannot revoke that record's resource.
Built-in commands that consume no attachments create no record lease, so accepted unused
attachments are released. Settlement is idempotent and old epochs cannot publish into a newer draft.

`useAttachmentDraft` binds attachment cleanup to React layout lifecycle and committed notebook
changes, including StrictMode replay. A null-to-first-notebook transition preserves the draft
because attachment admission can create that notebook. Tests cover reset/unmount, late results,
concurrent uploads/submissions, retry, record transfer before later failure, and snapshot clearing.

## Shared resource leases and record removal

`AttachmentUrlRegistry` counts live leases for explicitly admitted blob URLs. Drafts own one
lease per resource and keep it pinned while submissions are pending. `AttachmentRecordResources`
reconciles the union of managed URLs referenced by actual QA/action records, acquiring additions
before releasing removals. Store subscription covers CRUD, direct/bulk state replacement and
streaming-created QA copies. A URL is revoked exactly once when its final lease is released.

This replaces the temporary committed flag and explicit transfer callback: actual record state
is authoritative. Removing a record while its failed submission still retains a draft leaves
that draft valid. Removing a newly published record synchronously also cannot leak the URL after
the submission settles. Tests exercise both directions of shared draft/record ownership.

Remote URLs are never revoked. Record reconciliation only retains blob URLs already admitted
by a draft. Text-input revision ownership and shared loading leases are described in
`COMMAND_SUBMISSION_LIFECYCLE.md`.

## Empty-state notebook admission

`EmptyStateAttachmentUploadService` preserves the combined `create_notebook_with_files`
endpoint for the first batch. Concurrent batches share that creation and upload their own
files once to the resulting notebook. Creation awaits Store activation before publishing
kernel readiness or preview URLs. Existing-notebook uploads never adopt IDs returned by an
upload response. Ownership checks reject a changed current notebook before publishing results.
The existing top-level and nested creation response shapes are accepted and validated.

Both admission services use `createAttachmentFiles` for unique IDs and complete rollback of
partial browser URL allocation. The production `EmptyState` owner uses `useAttachmentDraft`
and passes its files plus `replaceFiles` to the unchanged controlled input interface. Replacing,
removing or clearing a batch releases draft leases; QA/action records retain their own leases.
A failed submission leaves the draft available, including after removal of its message record.
Unmount and committed notebook changes release remaining draft resources. Initial notebook
creation preserves the draft.

`replaceFiles` accepts arrays or functional updates and acquires new leases before releasing
removed ones. Reusing a URL under a new ID cannot revoke it prematurely. Replacing an ID with
a different URL while an older submission is pinned keeps the two resources separate; settling
the old submission cannot remove or release the replacement. Upload append and controlled
replacement use the same admission logic.

The preparation/suggestion/navigation sequence is owned by `EmptyStatePreparationSession`.
That session rejects late results and frees their URLs before acceptance. Upload services
currently compare notebook IDs, so they do not themselves detect away-and-back switches;
the preparation hook does cancel those transitions. Failed or superseded requests do not
roll back server-side notebook/file creation. The draft hook responds to committed React
notebook changes rather than every external Store transition.
