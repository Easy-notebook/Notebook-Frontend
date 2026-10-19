# Operation stream completion boundary

The operator Store reserves its busy state before awaiting kernel initialization. A second
caller cannot pass admission while the first is initializing, connecting, reading or handling
responses. The reservation is released only when the entire stream and its handlers finish,
or when initialization, connection, decoding, parsing or handling fails.

`OperationStreamReader` owns the reader lock and incremental UTF-8 decoder. The wire format is
concatenated JSON objects separated by optional whitespace. Objects may span chunks; a chunk
may contain several objects. Quoted braces, escaped quotes/backslashes, nested objects and
multibyte UTF-8 split at any byte boundary are supported. Objects are recorded and dispatched
in wire order, awaiting each handler before advancing. EOF flushes the decoder and rejects
truncated JSON/UTF-8 instead of reporting successful completion. Failure before EOF cancels
the reader; every exit releases its lock.

This removes the unawaited recursive reader and fire-and-forget handler calls that previously
released busy state after the first read. Missing response bodies are errors. Initialization
errors now enter the same Store error/toast/finally path as transport failures.

`OperationDispatcher` owns explicit idle → initializing/connecting → streaming → idle
transitions. Store loading is a projection, not the admission lock. Operation payloads are
captured with structuredClone before initialization or subscriber callbacks can change them.
The Store adapts history, responses and error notifications to the dispatcher.

Two public entry points share this one lifecycle:

- `submitOperation` resolves to a discriminated receipt: refusal (`busy`, `failed` or `cancelled` plus a
  message), or acceptance with an operation ID and a separately awaitable completion Promise.
- `sendOperation(...): Promise<void>` preserves the existing public interface by waiting for
  that same dispatcher's completion when accepted. Errors continue through Store/toast reporting.

Acceptance means a successful HTTP response with a body was established. It does not assert
business execution success; later decoding, stream or handler failure is reported through the
Store while leaving the original receipt unchanged. Both command input handlers now wait for
admission, retain drafts on refusal, and remove their provisional QA/action records. Operator
attempt history remains available for failed connection attempts. Existing memory interaction
logs still record attempted starts and are not rolled back.

The Store subscribes synchronously to notebook identity transitions. Each dispatch attempt owns
an AbortController and request identity. A switch cancels the old attempt and releases its
admission slot; its eventual completion cannot release a newer attempt's slot. This detects
away-and-back transitions. Initialization may adopt the first null-to-created notebook transition,
but its returned kernel ID must match the observed notebook identity.

The signal reaches fetch and the stream reader. Cancellation unblocks pending admission even
when initialization/transport promises ignore abort. Late response bodies are cancelled before
acceptance; blocked reads are cancelled and release their locks. Cancellation is a separate
receipt outcome and does not produce an error toast. Buffered events are checked before and
after each handler so later events cannot run after cancellation. History publication checks
the signal again before dispatching a handler, covering synchronous Store subscribers.

An already-running handler cannot be forcibly interrupted by this boundary and may finish its
own work; async action effects still require captured ownership individually. CodeStore kernel initialization now uses a notebook-owned KernelSession, which invalidates
late adoption/readiness publication on notebook changes. Backend create/restart requests still
have no rollback here; effects already applied before cancellation are not undone. Cancellation
does not roll back events already applied. The parser expects the existing JSON-object protocol;
it does not add SSE or array-root framing.

Framing state (object depth and quoted/escaped string state) belongs to each consume call
and persists across decoded chunks. Each character is scanned once; partial object fragments
are joined only when the object closes. This avoids repeatedly scanning or concatenating a
large incomplete code/output message as small network chunks arrive. Framing takes linear
work in decoded input size and retains the current object until it can be parsed. There is
no new message-size limit. A generator yields each completed object before scanning the next,
so handler backpressure and cancellation also apply within a single buffered network chunk.

Code-output submission uses `CodeOutputSubmissionService` for both the workflow action and
public command adapter. It captures the current cell and notebook before dispatch and delegates
ownership/cancellation to the dispatcher. The workflow reports success only after admission;
busy, failed and cancelled receipts report failure with the dispatcher message. Success does
not wait for stream completion and does not assert successful analysis. The public void-returning
adapter retains its signature. Missing output snapshots still trigger execution and report
that nothing was submitted; an empty output array remains a valid silent execution snapshot.
