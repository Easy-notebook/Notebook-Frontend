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

The public `sendOperation(...): Promise<void>` interface and error/toast behavior remain.
Its resolved Promise still does not distinguish refusal/failure from success: a separate
acceptance contract is pending before command inputs can reliably retain text on remote
refusal. There is no request cancellation/epoch binding to notebook switches yet. The parser
expects this existing JSON-object protocol; it does not add SSE or array-root framing.
