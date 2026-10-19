# Dataset analysis lifecycle

The pre-stage Store delegates file selection to `DatasetAnalysisSession`. Public Store methods
and state fields remain unchanged. The session owns the lifecycle independently of the
externally writable `isUploading` presentation field.

Transitions:

- Any state → analyzing: select a file, immediately clear previous columns and dataset summary.
- Analyzing → ready: publish a successful result only if that exact request is still current.
- Analyzing → failed: clear loading and report the current error without retaining old columns.
- Any state → idle: clear the selection or invalidate before Store reset.
- A newer selection supersedes earlier work, including selecting the same File object again.

The parsing API has no cancellation mechanism. Superseded work may finish, but cannot publish
results, clear another request's loading state, or report an obsolete failure through the Store.
A synchronous subscriber may reset or replace selection during publication; ownership is checked
before starting analysis and after awaiting it. Store reset invalidates before publishing its
initial state so a subscriber can safely start a new selection.

Store integration tests cover both completion orders, clearing/resetting pending work, stale
failure, current failure and retry, repeated File identity, synchronous reset, and external
loading changes. Dataset description formatting is preserved for downstream API requests.

The command input's `EmptyStatePreparationSession` owns the surrounding upload, preparation,
suggestion request and navigation sequence. Each new batch supersedes the previous sequence.
The React hook cancels on unmount or a notebook change, including synchronous away-and-back
switches; initial null-to-created notebook admission is preserved. File removal and submission
also cancel preparation. Cancellation clears the 500 ms navigation timer and settles that wait.
Suggestions start after dataset preparation completes, replacing the former arbitrary one-second
wait. Responses are validated before publishing; obsolete completions and errors are ignored.

Uploaded preview URLs returned after cancellation are released before acceptance. Accepted
attachments still use the component's controlled file list; their draft/record lease integration
is pending. Cancellation suppresses continuation effects, but does not abort backend network
requests or the Store's already-started parser computation. Dataset analysis remains owned by
Store selection/reset, independently of the mounted command input.
