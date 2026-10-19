# Stream event ownership

Task completion, task failure, workflow-stage change and global-error actions capture
QA ownership before awaiting notification delivery. `CapturedQAEvent` chooses an explicit
payload QId when present, otherwise the currently running QA or the existing first-item
selection policy. The event is cloned at capture so later payload mutation cannot change
its recorded meaning. Append targets that captured ID; the store updates existing QAs only,
so a removed or missing owner never redirects to another QA or gets recreated.

`QAEvent` is shared by QAItem.toolCalls and addToolCallToQA, including structured result,
error, metadata and details. Payload fields used by these actions are declared explicitly;
unknown structured results stay unknown rather than widening the interface with any.
The existing public event names and toolCalls array shape are retained.

Tests defer notification promises, switch the running QA, then verify all four actions
append only to the original owner. Additional tests cover explicit IDs, detached nested
results and deleted/missing owners. Notification rejection still propagates and prevents
recording, preserving current action sequencing; durable delivery/replay is not implemented.
Other generation/communication action ownership remains separate migration scope.
