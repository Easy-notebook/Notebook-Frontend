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

- `submitOperation` resolves to a discriminated receipt: refusal (`busy` or `failed` plus a
  message), or acceptance with an operation ID and a separately awaitable completion Promise.
- `sendOperation(...): Promise<void>` preserves the existing public interface by waiting for
  that same dispatcher's completion when accepted. Errors continue through Store/toast reporting.

Acceptance means a successful HTTP response with a body was established. It does not assert
business execution success; later decoding, stream or handler failure is reported through the
Store while leaving the original receipt unchanged. Both command input handlers now wait for
admission, retain drafts on refusal, and remove their provisional QA/action records. Operator
attempt history remains available for failed connection attempts. Existing memory interaction
logs still record attempted starts and are not rolled back.

There is no request cancellation/epoch binding to notebook switches yet. The parser expects
the existing JSON-object protocol; it does not add SSE or array-root framing.
