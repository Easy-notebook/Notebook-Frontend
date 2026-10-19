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

This boundary does not yet own the command input's suggestion timers, backend question request,
notebook changes, or workflow navigation. Those UI continuations require their own cancellation
and result ownership. Server upload and browser preview URL lifecycles remain separate concerns.
