# Command submission ownership

Both workspace terminal and empty-state command input use `CommandDraft` through
`useCommandDraft`. The existing input controls publish edits to the same draft. Enter during
IME composition does not submit. A pending submission prevents duplicate admission from repeated
Enter/button events, while editing remains available.

Submission captures trimmed command text, revision and notebook epoch. Only an accepted result
may clear text, and only when the same revision and epoch still own the draft. Rejection or a
thrown error retains text for retry. Editing away and back to the original string creates a new
revision and is preserved. Notebook changes and unmount invalidate UI completion/error effects;
initial null-to-created notebook admission preserves the draft. StrictMode cleanup is supported.

`SubmissionActivity` owns one global loading lease per admitted submission. Completion releases
only that lease, exactly once. Overlapping inputs cannot clear each other's loading state.
There is no fixed cleanup timer. An operation still running after its input unmounts retains its
activity lease until it settles, while it can no longer alter the unmounted input.

Workspace attachment submission still pins its own snapshot. Empty-state workflow invocation
is awaited instead of launched in an unobserved async closure. The command draft receives thrown
startup errors through the same failure path as other submission errors.

Both input handlers now await `submitOperation` admission. Busy, kernel initialization failure,
HTTP failure or a missing response body return a refused receipt, retain text/attachment drafts,
and remove provisional message records. Acceptance clears only the submitted unchanged text
revision and submitted attachments; newly uploaded empty-state attachments remain intact.

Acceptance means an HTTP stream was established, not that execution succeeded. Later stream
failures continue through Store/toast reporting and cannot retroactively restore a draft that
was already accepted. Workflow state-machine methods may still record internal errors without
rejecting; workflow cancellation and execution receipts remain separate work. Global loading
tracks pending submission admission, not the full duration of streamed AI execution. The existing
`sendOperation` completion interface remains available through the same dispatcher.
