# Cell status polling ownership

CodeStore delegates startStatusCheck/stopStatusCheck to CellStatusPoller without changing their
public signatures or the numeric statusCheckInterval projection. Each polling session captures
its notebook ID and cell ID and owns one interval, one AbortController and a Store subscription.
It allows at most one status request in flight; ticks during a slow request are skipped.

Stop, restart, cell removal, notebook changes (including away-and-back) and reset retire old
sessions, clear timers, detach subscriptions and abort status fetches. A response/error must
still belong to the same session before it can publish outputs or execution state. ResetAll
retires every session before clearing CodeStore state. On notebook changes/removal, retirement
does not recreate or mutate the vanished owner's execution-state entry.

Terminal status publishes outputs and then retires its session. Ownership is checked again
after output publication because subscribers may synchronously start a new polling session.
Old completion/error cannot stop that new session. A nonexecuting cell is stopped before any
new status request. Failures from superseded requests are ignored; current failures stop polling.
The optional signal reaches CodeExecutionService.getExecutionStatus and fetch.

Store tests cover slow requests, stop/restart, notebook switching, deletion, reset, terminal
outputs, stale/current errors and synchronous restart during output publication. Kernel/session
regressions are included in targeted checks.

Actual execute/cancel requests are now owned by CellExecutionSession. While that session
is active, a terminal poll retires only polling and leaves isExecuting true until the execute
response settles. Standalone polling still completes its execution projection as before.
See CELL_EXECUTION_LIFECYCLE.md for execution admission, cancellation and output ownership.
The backend status endpoint remains notebook-wide; independent external executions are outside
the client session's admission boundary.
