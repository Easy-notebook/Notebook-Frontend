# Agent tail-latency investigation — 2026-10-28

## What was changed

- Removed duplicate raw action logs, empty-state instructions, repeated idle/status labels and redundant summary cell identifiers. Actions and payloads remain accessible in the execution views; pending approvals remain visible.
- Reduced Agent Cell header, input and article spacing. Detail inspector focuses on execution history rather than duplicating the complete answer transcript.
- Render dialogs through a body portal, with an explicit details variant rather than descendant `:has()` queries for modal layout.
- Open a fixed-size detail shell before scheduling its contents with a React transition. This removes content mounting from the synchronous native modal activation path.
- Restore the opener focus in a microtask after React removes the portal, only if focus is on the body; do not steal focus from another control. Browser verified the original Agent details trigger regains focus.
- Removed obsolete transcript styles.

## Instrumentation and limits

Test fixture only: rAF intervals, Long Animation Frames (LoAF), long tasks, native `showModal`/`close`/`focus` timings, React commits, and browser JS Self-Profiling sampled stacks. Vite enables `Document-Policy: js-profiling` only for the local live verification page. Profiling is not enabled for the production app. Raw profiles contain frames, resources, stacks and samples.

A request to open native `chrome://tracing` was denied by browser security policy. The denial explicitly disallowed alternate surfaces and raw CDP workarounds. No bypass was attempted. Therefore these artifacts are page-level traces and sampled JavaScript stacks, not full renderer/OS traces. Missing page stacks do not prove idle CPU, GC, browser bugs, or OS scheduling.

## Real provider workload

Two browser-driven rounds using real Codex and Claude Code, each requesting one `list_cells`, fifteen `read_cell` calls and a long, 20-section Chinese answer. No action injection or sample events. The final round retained the previous answers and called both providers concurrently, while inspecting live details, changing the action view, collapsing/expanding 16 steps and scrolling.

Final visible notebook answer lengths: Codex 5,018 + 4,876 characters; Claude 3,944 + 3,610 characters. Claude was also displayed in the sidebar. All six rendered answer containers had `aria-busy=false`; all Agent headers were no longer running. The first capture ended before Codex's first answer had fully finished, so it is not a complete-generation baseline.

## Specific call attribution

Initial native sampling identified `AgentDialog` effect → test wrapper → native `showModal` at **32.7ms**, and cleanup focus restoration at **14.4ms**. LoAF attributed approximately 32ms forced layout to that click. This is direct evidence of the modal activation cost, not an inference from React duration.

With deferred detail contents, the isolated completed-answer open/close check had a **17.7ms maximum rAF interval**, **zero LoAF**, and native `showModal` calls of **14.9 / 12.8ms**. After restoring accessible opener focus, the final heavier real run measured `showModal` at **12.6 / 24.8ms**, close at **0ms**, focus restoration at **17.2 / 13.8ms**. Neither modal opening/closing operation overlapped a LoAF in that final capture. These are a small number of observations, not a guarantee for every notebook size.

## Whole-run tail results — unresolved spikes retained

| Capture | Duration | rAF P99 | Maximum rAF | Intervals >50ms | Long tasks |
|---|---:|---:|---:|---:|---:|
| First sampled real run | 156.5s | 17.7ms | **415.8ms** | 5 | 0 |
| Final cumulative real run | 175.6s | 17.7ms | **133.7ms** | 8 | 0 |
| Observation control, completed real answers | 74.2s | see JSON | 33.5ms | 0 | 0 |

The first sampled run reproduced a larger stall of the same general symptom as the previous 284ms interval. In its 143494–143910ms window, 15 samples have no page stack, and two identify short Markdown tokenization / AgentTree rendering. LoAF has blockingDuration=0 and only short attributed scripts (11.4ms publish, 10.1ms scheduled rendering, 17.2ms publish). This does not account for the whole 416ms interval.

The final 133.7ms interval at 632879–633013ms contains nine samples without a page stack and two in `NotebookSaveScheduler.attempt → write → performSave → NotebookSnapshotDocument`, including native `Blob`. The associated debounce callback is 15.5ms; that alone cannot explain a 134ms frame. It is a lead, not proof that autosave caused the full spike. No speculative persistence changes were made on this evidence.

Full-text, full accessibility-tree, and text-length observations were timestamped in a separate controlled run. None reproduced the spike, so browser observation overhead is not established as the cause either. Final unexpected layout shift sum was 0; first sampled capture was 0.0156. rAF, LoAF, and longtask metrics measure different things and must not be substituted for each other.

**The historical 284ms cause remains unresolved. The result must not be described as a completely smooth or fully fixed execution path.** Resolving the native/unattributed interval requires an authorized full renderer trace with process scheduling/GC/native events, which the available browser policy does not permit obtaining here.

## Validation

20 tests passed across AgentVisuals, AgentCellSession and AgentRunProjection, including a new portal removal / focus restoration regression. Existing jsdom motion tests emit a non-failing `window.scrollTo` not-implemented warning. Actual focus and execution interactions were also checked in the browser.

## Artifacts

- [First real trace](performance-results/agent-tail-native.json)
- [First sampled CPU stacks](performance-results/agent-tail-cpu.json)
- [Compact dialog check](performance-results/agent-dialog-compact.json)
- [Observation control with wall-clock windows](performance-results/agent-observation-control.json)
- [Final real trace](performance-results/agent-tail-final.json)
- [Final sampled CPU stacks](performance-results/agent-tail-final-cpu.json)
