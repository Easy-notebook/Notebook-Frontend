# Workflow snapshot and domain boundary

The workflow Store exposes serializable StateJSON snapshots. TransitionCoordinator and its
handlers operate on the observation WorkflowState model, whose Location/InternalState/FSM
objects provide transition methods. These representations are not interchangeable.

Both Store transition entry points (`transition` and `handleAPIResponse`) use one conversion
boundary: clone the input snapshot, construct the domain model, apply the coordinator, then
serialize the returned model with toJSON before publishing. Cloning isolates the published
Store snapshot from mutable domain operations. Type assertions no longer disguise domain
objects as JSON snapshots. Existing transition history and failure reporting are retained.

Regression coverage uses the real CompleteWorkflowHandler through both entry points and
checks terminal state, last transition, metadata preservation, input immutability, plain
objects and structured-clone support. This boundary does not serialize concurrent requests
or cancel already-running action side effects; workflow request ownership remains a separate
lifecycle concern.

Control updates (fail/cancel/pause/resume and initial workflow variables) now copy the
published snapshot before modification. Repeated pause is a no-op, preserving the original
resume target. Direct transition/API-response publication compares its captured snapshot
identity with the current Store snapshot after awaiting: if a control or another update
replaced it, neither a late result nor a late error can publish over the replacement.
This is optimistic publication ownership, not a queue or cancellation of handler side effects.
The automatic loop has its own run session, described below.


`WorkflowRunSession` owns one automatic run through preparing → running → settled phases.
A new start supersedes the previous run. Cancel, reset, failure, pause, and notebook identity
changes settle the current run promptly and abort its signal. Only the current run can publish
steps or release its running flag; late completion cannot clear a newer run's flag. The Store
publishes `isExecuting` through Zustand instead of mutating it silently. Resume creates a new
run at the saved phase; a fresh start explicitly begins in IDLE. A run stops on terminal or
paused state, no transition, or the configured iteration limit.

The adapter checks the signal before work, after asynchronous boundaries and between streamed
actions. A cancelled stream cannot start its next action or apply its final transition after
returning from pending work. Existing callers may omit the optional signal. Already-running
API calls, actions and transition handlers are not forcibly interrupted or rolled back; the
run can settle while that work drains. Backend transport cancellation still needs support
through the state/API client layers. This does not serialize separate direct transition calls.
