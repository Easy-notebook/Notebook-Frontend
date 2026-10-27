# Kernel session ownership

CodeStore delegates creation/adoption/restart to `KernelSession` while preserving its public
initializeKernel(): Promise<string | false> and restartKernel(): Promise<boolean> interfaces.
Readiness/error publication remains in CodeStore; backend and notebook activation are ports.
The session subscribes only during an active attempt, avoiding a Store initialization cycle.

Concurrent initialization shares one request and one result. A selected notebook retains the
existing assumption that it can be used without another create request. A stale ready flag with
no selected notebook no longer prevents initialization. A successful create response must contain
a notebook ID; readiness is published only after notebook adoption completes and still belongs
to the same attempt.

Notebook transitions invalidate pending attempts synchronously, including away-and-back changes.
The only permitted transition is that attempt's null-to-created ID during its own adoption.
ResetAll and explicit setKernelReady also supersede pending work. Invalidation settles waiting
callers with false and detaches the subscription; eventual backend success/failure cannot adopt
its notebook or publish stale readiness/error. Superseded cleanup cannot affect a newer attempt.

Restart captures the selected notebook ID. Concurrent restarts share one request; initialization
while restarting waits for that restart. Restart without a selected notebook, or while initial
creation is running, returns false instead of issuing a conflicting request. Restart success and
failure publish only while their notebook remains selected.

Tests cover concurrent calls, delayed adoption, notebook switches, reset, missing IDs, retries,
stale ready state, explicit readiness overrides and restart ownership. These are client-side
publication guarantees: pending backend create/restart operations cannot be undone, and server
resources already created are not deleted. Cell execution/polling and independently initiated
notebook creation outside CodeStore retain their own lifecycles and require separate auditing.
