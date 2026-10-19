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
resume target. Direct transition/API-response calls share WorkflowTransitionSession. Each
invocation watches its captured snapshot identity and notebook identity. A control update,
competing publication or notebook navigation aborts its transition signal and suppresses late
results/errors. This is optimistic ownership with cooperative handler cancellation, not a queue.
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
server work, actions and transition handlers are not forcibly interrupted or rolled back; the
run can settle while that work drains. Backend transport cancellation is now forwarded through the state/API client layers. This does not serialize separate direct transition calls.


All three workflow endpoints share one line-stream transport. Optional cancellation flows
from adapter → BaseState → API handler → WorkflowAPIClient and is combined with the existing
request timeout. The reader owns abort handling, early-return cancellation and lock release.
Blocked body reads are cancelled; buffered successor lines are checked before yielding. The
protocol continues to accept JSON lines, `data:` JSON lines and comment/blank lines, logging
and skipping non-JSON lines as before. EOF flushes the decoder and processes a final line
without a newline. This is the existing line protocol, not a general multiline SSE parser.
Browser fetch abort does not guarantee server-side rollback, and already-started action code
still requires its own lifecycle/ownership checks.

Exceptions from API calls, stream iteration, transition application and streamed action
execution propagate through the adapter to the owning run. An owned failure publishes FAILED
and error metadata and releases the busy flag. It is not converted to a successful no-transition
step. An action exception closes iteration before later actions or the final transition run.
Cancellation still takes precedence and stale failures cannot fail a newer run. Previously
applied action effects remain applied; this is stop-on-error behavior, not transaction rollback.
Action methods that return application-specific failure values instead of throwing retain
their existing return contracts and require separate interpretation by their callers.

Transition-owned notebook actions use the same failure rule. BaseTransitionHandler propagates
an execution exception instead of returning success after logging it. A failed step-heading
insertion therefore prevents STEP_RUNNING publication; initialization stops before subsequent
description/section actions if title update throws. Successful actions still execute once.
The optional absence of a scriptStore retains headless transition behavior.

Exhausting the configured step budget while a run still requests another transition is an
explicit failure, with the configured limit included in error metadata. The final allowed step
may finish normally with a terminal/paused state or no transition. Synchronous cancellation
from a publication subscriber takes precedence over budget failure. The budget counts adapter
step calls, including initial planning, and does not imply a limit on streamed actions per step.

ScriptStore rejects missing, blank and non-string action types before creating an execution
record. Unregistered action names reject through the same error path as action exceptions,
settling their record as failed so the owning run cannot mistake unsupported work for success.
Each invocation captures a detached request before its first asynchronous boundary. It updates
the exact record ID returned by addAction, even when a synchronous subscriber inserts another
record during publication. This protects request and record identity; it does not yet bind every
action's internal asynchronous side effects to a notebook session or interpret structured
failure return values.

`ScriptCodeExecution` owns the notebook-facing lifecycle of code execution through executing,
publishing, waiting-focus and settled phases. Notebook changes or cell removal invalidate the
attempt permanently, including away-and-back navigation and deletion/recreation with the same
cell ID. Kernel initialization may assign the first ID to an unsaved notebook, matching the
underlying execution session. Failed-code debug focus retains its subscription until its timer
fires or the context invalidates, then releases both resources.

Execution outputs are appended to a detached workflow snapshot and published once per result.
The prior snapshot remains unchanged. Planning-context effects are also appended in one batch,
with ownership rechecked after synchronous workflow subscribers run. Notebook invalidation
returns false through the existing code-execution failure contract. An optional AbortSignal
now flows from the automatic adapter through ScriptStore and registered code actions to this
session. Pause/cancel/supersession invalidate result publication and pending debug focus, even
on the same notebook. Cancellation throws its original reason after pending execution drains;
backend work is not rolled back or forcibly interrupted.

ExecCodeAction delegates output publication exclusively to ScriptCodeExecution; it no longer
reads global notebook outputs and appends the same effects a second time. Both code actions
check cancellation before post-execution indicators or debug metadata writes. Their initial
clear-effects operation also starts from a detached snapshot. ScriptStore checks cancellation
before action admission and before recording success, settling an existing action record through
the error path. Other action implementations still require their own cancellation checks around internal awaits.

ScriptCodeExecution now retains the structured ExecutionResult internally. The existing public
execCodeCell boundary alone projects it to output/error/false; repair metadata never infers
success from that lossy representation. RepairedCodeExecution is shared by workflow and
operation-stream exec_new_version handlers. It selects a code cell, clears effects while the
execution subscription is active, and records the actual success flag through the owned
completion callback. Metadata is merged with the live cell, preserving edits made during
execution. Missing targets and mismatched operation notebook IDs do not clear effects or execute.
Both entry points retain their existing return conventions. Unexpected execution exceptions
still follow the existing false-return contract rather than manufacturing a successful result.


Transition cancellation is invocation-scoped: adapter → coordinator (including automatic
follow-up transitions) → handler → executeAction → ScriptStore. The signal is an optional
argument, never mutable context on shared handler instances. Handlers that dispatch notebook
actions check at entry and between actions; the coordinator checks before dispatch and after
awaited results. Cancellation during a pending title action stops later description/section
writes and rejects the transition without publishing its cloned state. Two concurrent calls
through the same handler retain independent signals. Already-applied notebook actions are not
rolled back. Direct Store transitions acquire their own signal from WorkflowTransitionSession,
so they do not depend on an automatic run being active. Ownership loss releases both subscriptions
immediately, even while a non-cooperative handler drains. Normal completion releases observers
before publication so its own snapshot does not cancel the completed attempt. Responses and
input snapshots are copied before dispatch, and history is recorded only by the owning transition.

Run admission orders start/stop commands before notifying cleanup observers. If a busy-state,
abort or unsubscribe callback issues another command synchronously, that later command wins;
the interrupted start resolves without installing a second owner. Old unsubscribe cleanup cannot
clear a replacement run's busy flag. A subscription that immediately invalidates its run is
released as soon as registration returns, before any initial snapshot or preparation is published.

`NotebookActionScope` owns ScriptStore action admission and execution. It captures notebook
identity before lazy module imports and combines notebook invalidation with the optional caller
signal. Switching away and back cannot revive an admitted request. Sidebar cell/view context is
captured before awaiting. A sidebar subscriber that navigates before dispatch prevents execution
and settles that invocation's record as failed. During execution only, the first ID assignment
to an unsaved notebook is accepted to support kernel initialization. Cancellation releases the
notebook subscription immediately; ordinary completion releases it in finally without aborting
already-completed work. Action implementations must still check the supplied signal around their
own asynchronous side effects; this scope does not make non-cooperative code interruptible.

Code-output submission forwards the action signal through the submission service and OperatorStore
to OperationDispatcher as an admission signal. Pre-cancelled requests do not prepare missing code
outputs or reserve an operation. Cancellation during kernel initialization or connection opening
settles admission promptly and reclaims any late stream body. Once accepted, the caller's listener
is detached: the response stream belongs to OperationDispatcher and remains governed by notebook
identity and its own completion. Thus finishing the workflow that submitted an operation does not
retroactively cancel an accepted operation. Backend work already started may still drain.

NotebookExecutionActivity aggregates workflow and run-all ownership into the existing public
isExecuting flag. Each invocation releases only its own activity; one completed owner cannot
mark another active owner idle. Notebook identity changes invalidate old activities, including
away-and-back navigation. Workflow acquisition handles synchronous cancellation/replacement
while busy subscribers run. Run-all checks activity ownership before subsequent cell execution
and avoids clearing a different notebook's phase marker during old cleanup. This aggregate is
UI activity, not a kernel scheduler: CellExecutionSession still owns single-kernel admission.


The public executeAction convenience helper normalizes/copies parameters before its lazy Store
import, watches notebook ownership during that wait, and hands off to ScriptStore's common
execution boundary. It no longer performs independent registry lookup or silently succeeds on
unknown actions. The explicit action type selects the handler; object parameters cannot replace
it. A supplied cancellation signal continues into execution, and helper admission releases as
soon as ScriptStore synchronously acquires its own scope.

CompleteWorkflowPlanningAction awaits its first-stage heading action before publishing
STAGE_RUNNING. It prepares a detached snapshot, forwards cancellation, propagates heading errors,
and discards a result if another workflow snapshot has replaced its input. This removes the
unowned fire-and-forget action and mutation of already-published planning state.

Synchronous planning actions use the Store's updateState recipe boundary. A local Immer instance
creates copy-on-write snapshots without globally freezing shared state; currentState and stateJSON
publish together only when the recipe changes data. A thrown recipe publishes nothing, and no-op
recipes preserve Store/snapshot identity so they do not invalidate pending transition ownership.
Stage/step planning, stage context, delegation and behavior completion now use this boundary.
CompleteStagePlanning validates that steps exist before setting planning_complete, allowing a
later retry instead of retaining a completion flag from a rejected transition. Asynchronous actions
continue to use explicit captured snapshots and ownership checks rather than async recipes.

Context updates (agent, progress, location and step focus) and effect clearing also use the
synchronous recipe boundary. Clearing current effects retains the shared domain archive logic,
serializes only the effects subtree, and does not publish when already empty. Unknown agent
sections are rejected before creating an agent record. CompleteReflection captures workflow and
notebook ownership before its notebook metadata write, then checks ownership and cancellation
after synchronous subscribers run before resuming the workflow. This prevents a metadata
subscriber's cancellation from being overwritten; it does not roll back the metadata update.
