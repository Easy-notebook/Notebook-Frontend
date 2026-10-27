# Streaming answer lifecycle

The response path has three distinct owners:

- `OperationDispatcher` owns one transport from admission through response consumption and settlement.
- `QAStreamManager` owns the currently active answer occurrence, its transport signal, interruption callback and abort-listener cleanup. Occurrence identity is separate from the public QA ID, so a restart of the same QA has a new owner.
- `StreamingAnswer` owns answer-record transitions. The Zustand Store publishes the resulting records and preserves identity for rejected updates.

## Record transitions

The domain object derives its phase from existing public fields: `onProcess` takes precedence; otherwise an end timestamp distinguishes completed (`resolved`) and interrupted answers from idle records. This preserves the existing data shape.

| Input | Idle | Streaming | Completed / interrupted |
| --- | --- | --- | --- |
| Initialize/restart | Start fresh answer | Restart answer | Start fresh answer |
| Nonempty content | Append (existing early-event behavior) | Append | Ignore |
| Finish | Complete (existing early-event behavior) | Complete | Ignore |
| Interrupt | Ignore | Stop processing and timing; preserve content and resolution | Ignore |

Restart clears content and the previous end time. It preserves one original user-question snapshot under the existing `<qaId>-[0]` ID. It does not synthesize a user question from an assistant record.

Append and finish return whether the Store accepted the update. The action adapters use that receipt to avoid reopening the sidebar or recording a successful completion for ignored events. Successful finish fills the final response only when streamed content is empty, preserving existing precedence.

## Occurrence ownership

Starting a replacement publishes its owner before interrupting the previous occurrence. A subscriber may synchronously start a third answer during interruption; the displaced initializer must compare its returned occurrence before writing. Cancellation and clearing also compare the captured occurrence, rather than only the QA ID.

Normal finish releases the session without interrupting the answer. Cancellation, replacement, or transport settlement without a finish event interrupts the owned answer. EOF does not establish semantic completion. A settled transport cannot interrupt a session belonging to a newer transport.

The shared QA presenter checks cancellation around sidebar writes, lazy module loading and view changes. Empty cards animate only while processing; interrupted empty answers show the localized interruption message. Partial text remains visible.

## Boundaries

Incoming chunks do not carry a separate generation identity. A late chunk for a newly restarted identical QA ID cannot be distinguished by the record alone; correctness also depends on transport cancellation and action ownership. Direct external Store writes do not acquire manager ownership. Existing externally supplied duplicate snapshot IDs are not destructively normalized.

Relevant checks live in `AIAgentStore.streaming.test.ts`, `QAAnswerCancellation.test.ts`, `QAStreamManager.test.ts`, `QAViewPublication.test.ts`, `FinishStreamingAnswerAction.test.ts`, `operatorStore.test.ts`, and `QACard.test.tsx`.
