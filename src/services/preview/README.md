# Preview request ownership

`PreviewRequestLifecycle` owns publication rights for one replaceable asynchronous
request. The preview store creates its owner inside the Zustand initializer; no
request ticket is persisted or exposed as application state.

Transitions:

- `begin`: any phase → loading with a new opaque ticket.
- `settle`: current loading ticket → ready or failed; obsolete tickets do nothing.
- `cancel`: any phase → idle, invalidating the previous ticket.

Split preview checks ownership after cache reads and network responses, and settles
only after any required cache write has finished. A replaced request returns
`undefined`; it cannot publish a file, clear a newer loading indicator, or report
an obsolete error. Closing, resetting, or changing notebook context invalidates
split loading. Admission precedes the loading notification, so synchronous
subscribers can cancel before I/O begins.

Cancellation does not abort an already started HTTP request or cache transaction.
An admitted cache write may finish after cancellation; its result cannot reopen
the split preview. The existing public return type remains `FileObject | undefined`.
Normal tab loading and saved-tab restoration have separate asynchronous lifetimes
and are not covered by this owner.

`src/store/previewStore.lifecycle.test.ts` exercises the real store with controlled
cache/network promises, including replacement, failures, close/reset, notebook
transitions, and reentrant subscription cancellation.
