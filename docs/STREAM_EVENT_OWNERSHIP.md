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

## Incoming agent-help requests

`ask_agent_for_help` creates a pending user QA through `AIAgentStore.addQA`, using
`content`, `type`, `resolved`, `onProcess` and `agentType` from the actual shared contract.
It no longer calls the nonexistent addNewQA method or sends a question-shaped object to
an incompatible API. Empty/missing questions remain no-ops; malformed non-string wire
fields reject before mutation. The existing general-agent default is preserved.

QA admission precedes notification. If notification fails, the admitted QA remains and
the failure propagates without an additional misleading creation-failure notification.
This records the incoming request; it does not add a new backend dispatch operation or
claim a response has been generated. Tests use the real QA store and mock notification.

## Remembered information

`remember_information` uses `AgentMemoryService`, not the QA store. Explicit notebook
context takes precedence over current selection; missing ownership and unsupported agent
types reject before mutation. Information/category are stored in the existing
`situation_tracking.current_context` history, so backend memory preparation and existing
storage reload include them without a second memory schema. The default agent/category
remain general, and existing ten-record retention applies.

The service constructs the next memory snapshot, writes `agent_memories_v2`, then publishes
it in memory and emits the update event. Quota failure leaves both prior snapshots intact
and prevents the success toast. A shared immutable context append is also used by ordinary
context updates. The new acknowledged write path does not change other memory methods'
existing best-effort error behavior; cross-tab memory coordination is not implemented.

Tests cover new/existing memory quota failures, isolation, retention, shared context updates,
and a real Chromium reload through backend context preparation.
