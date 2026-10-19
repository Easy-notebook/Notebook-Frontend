# Cell execution lifecycle

CodeStore delegates execution/cancellation to CellExecutionSession. A single notebook kernel
admits one task through initializing → running → cancelling/settled. A different cell receives
kernel_busy while that slot is occupied. Repeated execution of the same active cell requests
cancellation, preserving the existing run/stop interaction. Code and notebook ownership are
captured before initialization; the extra print("fast check") execution has been removed.

An attempt subscribes to notebook/cell changes. Switching notebooks, deleting the cell, reset
or kernel restart retires it, aborts execute/cancel fetches, stops polling and settles waiting
callers. Old completion cannot clear a newer task's state or publish/save outputs. Initial
null-to-created notebook adoption is allowed and checked against the initialized kernel ID.

Cancellation has its own shared Promise. While the endpoint is pending, execution responses
wait and do not publish. Cancellation success retires the attempt; failure resumes that same
execution and its polling. Notebook changes settle both execution and cancellation callers even
when a transport ignores AbortSignal. Cancellation during initialization prevents code dispatch.

The final execute response owns completion. Polling can publish interim outputs but an idle
poll result does not mark the task finished while its execute response is pending. Backend error
status is not treated as success. Partial outputs/tracebacks are preserved and saved; missing
error outputs are synthesized from the returned message. Publication rechecks ownership after
Store callbacks, including before autosave.

Public executeCell/cancelCellExecution signatures and result shapes remain. There is no server
execution ID in this API, so the client serializes local submissions to the notebook-wide kernel.
Other clients or independent direct service callers are outside that admission boundary.
Aborting fetch stops local observation; it cannot prove server-side execution stopped. Kernel
creation that was already in progress may finish after a local run is cancelled, but the cancelled
run cannot dispatch code. Effects already published before cancellation are not rolled back.
