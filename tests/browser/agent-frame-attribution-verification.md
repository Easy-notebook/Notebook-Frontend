# Real Agent frame attribution — 2026-10-28

## Scope and instrumentation

Browser-operated `tests/browser/agent-live.html`, using real Codex app-server and Claude Code SDK calls concurrently, not injected actions or sample animation data. Each provider performed `list_cells` plus 15 `read_cell` calls, then a long Chinese response. Sidebar tree collapse/expand and scrolling were exercised during streaming. Completed answers contained 5,087 (Codex) and 3,900 (Claude) rendered characters; all three answer views reported `aria-busy=false`.

Browser PerformanceObserver recorded rAF intervals, long tasks, long animation frames with script attribution, input timestamps, and layout shifts. Opt-in React Profilers separated the notebook root, Markdown answer, and action visualization. Normal application use does not enable these Profilers. Nested Profiler totals overlap: compare root durations, never sum them as total CPU time.

This browser connector does not expose CDP CPU sampling. LoAF attribution identifies an executing callback, not a complete sampled call stack. The historical 99.7ms sample lacked attribution and cannot be retrospectively diagnosed.

## Located synchronous rendering bottleneck

The stress baseline recorded six 50–58ms long animation frames. Browser attribution named `AgentCellSession.ts` → `publish`, invoker `TimerHandler:setTimeout`, with script execution up to 38.7ms and forced layout 0ms. `sourceCharPosition=2363` refers to the Vite-transformed module, not a TypeScript line.

Correlated React commits showed Markdown answers rendering in the synchronous store update (two displayed copies can update together). Root commit P99 was 26ms, maximum 35.6ms. Action visual P99 was 4ms. This supports expensive answer rendering as the reproduced publish bottleneck, not layout measurement in that callback.

`AgentAnswer` now defers the displayed text and memoizes the Markdown child. Urgent tool/lifecycle updates retain the previous rendered answer; React schedules the new answer separately and may supersede intermediate render work. The canonical answer remains unchanged. This does not make an individual parser function preemptible or delay approvals/cancellation state. `aria-busy` exposes catch-up state.

| Metric | Stress baseline | Deferred answer retest |
| --- | ---: | ---: |
| Capture duration | 159.4s | 239s |
| rAF P99 | 17.7ms | 18ms |
| Root React commit P99 | 26ms | 15ms |
| Root React commit max | 35.6ms | 23.1ms |
| LoAF attributed to publish | 6 | 0 |
| Largest rAF interval | 49.9ms | **284.2ms** |

Independent real model generations have different outputs, token timing, and durations; this is not a controlled statistical benchmark. Root total rendering time is not an appropriate normalized comparison.

## Remaining tail-latency anomaly — not resolved

The retest contains a 284.2ms interval near timestamp 237760ms and a 290ms long task. No React commit or captured user input overlaps that interval. LoAF records 267.6ms overall, but its only attributed script is the probe `tick` callback for 9.2ms. That does **not** explain the full stall. There is insufficient evidence to assign the remainder to application code, GC, browser instrumentation, or OS scheduling. The spike is retained in the raw report and must not be excluded to claim a smooth maximum. The historical 100ms event is likewise not proven fixed.

## Detail dialog path

A separate 51.2s capture on the actual completed long responses exercised sidebar/tree expansion, scrolling, opening details, switching its tree, expanding, scrolling and closing. It found click LoAFs of 79.8ms / 75.8ms, with React `dispatchDiscreteEvent` script time 70.6ms / 67.6ms and forced layout 48.6ms / 45.9ms.

The detail CSS overrode the native closed dialog display. Restricting flex layout to `dialog[open]` avoids laying out the closed detail inspector before native modal activation. Two subsequent open/close cycles on the same completed responses produced maximum rAF 34.2ms; attributed click script time was 40.4–40.6ms, forced layout 29.1–29.6ms. Click LoAFs still reached 53.3–54.9ms. This improves but does not eliminate the synchronous modal layout cost. Native modal focus containment and restoration remain intact.

## Raw captures

- [Initial ordinary workload](performance-results/agent-attribution-before.json)
- [Stress baseline](performance-results/agent-attribution-stress.json)
- [Deferred rendering retest, including unresolved 284ms spike](performance-results/agent-attribution-after.json)
- [Completed answers interaction trace](performance-results/agent-attribution-settled.json)
- [Dialog CSS retest](performance-results/agent-attribution-dialog.json)

No claim of zero dropped frames or full resolution of the historical 100ms event is supported by these results.
