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
Image, webpage and video generation use `GenerationRequestAction` to share command
construction, lazy operator loading, notification and captured event recording. Request
context overrides current notebook selection when explicitly supplied; otherwise the
current context is captured before asynchronous loading. Code execution captures both
its QA owner and code text before execution; Agent communication honors explicit QId.

Generation events record request initiation, not backend completion. Operator dispatch
retains its asynchronous behavior and owns send failures; this change does not redefine
the backend acknowledgement or generation-result lifecycle. Tests switch notebook/QA
while the operator import is pending and verify all three commands retain their original
context; additional tests cover explicit context, incomplete requests and code execution.
