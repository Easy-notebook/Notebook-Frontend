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
The separate automatic startWorkflow execution loop still requires its own lifecycle audit.
