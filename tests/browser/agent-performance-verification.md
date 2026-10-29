# Real Agent frame profiling — 2026-10-28

## Method

Used the in-app browser on `http://127.0.0.1:5174/tests/browser/agent-live.html`, Vite development build, 1280×720 viewport. Invoked real Codex and Claude Code concurrently through the normal chat controls. Each received the same prompt: list cells, read title/notes/calculation and repeat notes/calculation, then write a 12-section ~2,500-character Chinese answer. Both runs produced six real tool actions; optimized final answers were 2,550 and 2,602 rendered characters. No generated mock events or simulated model responses.

The test-only panel samples `requestAnimationFrame` while the page is visible, React Profiler commits, PerformanceObserver long tasks and layout shifts. Layout values below are sums excluding recent input, **not** standard session-window CLS. The panel sits outside the React Profiler so its result display does not count as application rendering. Frame sampling is not a compositor/GPU trace or an FPS guarantee.

## Measurements

| Scenario | Seconds | Frames | Frame P95 / P99 ms | >33.4ms / >50ms | React commit P95 ms | React total ms | Unexpected shift sum |
|---|---:|---:|---|---|---:|---:|---:|
| Concurrent stream baseline | 73.2 | 4384 | 17.2 / 17.6 | 1 / 0 | 14.3 | 5659.5 | 0.07009 |
| Concurrent stream optimized | 69.9 | 4188 | 17.6 / 17.7 | 0 / 0 | 12.9 | 2873.1 | 0.01804 |
| Collapse/scroll baseline | 25.0 | 1498 | 17.2 / 17.6 | 1 / 0 | 18.2 | 260.6 | 0 |
| Intermediate collapse/scroll (stream overlap) | 31.9 | 1899 | 17.5 / 17.7 | 5 / 2 | 14.2 | 1030.5 | 0 |
| Final collapse/scroll, same actual results | 46.6 | 2788 | 17.5 / 17.7 | 3 / 1 | 6.9 | 14.9 | 0 |

Baseline and optimized streams are independent live model generations with different timings and text. These are exploratory runs, not repeated statistically matched benchmarks. A TypeScript check also ran during part of the optimized stream; do not interpret sub-millisecond frame differences as causal improvement. Interactive windows have different stream overlap and durations. No claim of a universally faster FPS is supported.

## Findings and changes

1. Runtime metadata updates triggered Lexical reconciliation and made embedded nodes writable even when source/language/editor mode were identical. Runtime state already has its own store subscriptions. Skip document reconciliation for metadata-only updates, retaining snapshots for undo; language/source-mode changes still reconcile. A regression verifies both paths.
2. Action snapshots were recreated on every text publication. Preserve unchanged immutable action snapshots and memoize their projection separately from answer text. Tool transitions remain immediate. A regression checks snapshot identity across streaming publications.
3. Full Markdown answers were rerendered on unrelated parent state changes. Isolate the answer as a memoized component, preserving the existing parser and rendering semantics.
4. Growing answers pushed action controls down. Put the action controls before the streaming answer, consistent with the detail inspector. Observed unexpected shift contribution from `.av-live-run` disappeared in the optimized stream.
5. Every tree item requested Framer Motion layout measurement, even on clock/text updates. Remove per-node layout projection; retain the branch height/opacity collapse transition. Final interaction run recorded no >50ms main-thread long task, compared with a 56ms task in the intermediate run.

## Remaining evidence limits

Final interaction run still had a 99.7ms frame gap without a corresponding long task. This may involve rendering, scheduling, browser automation or system load; this capture cannot establish which. It is **not** a zero-dropped-frame result. Stream P95 did not improve materially. Genuine text growth and requested fold/unfold produce expected layout changes; the remaining stream unexpected shift sum is 0.01804.

Scrolled the actual sidebar with PageDown/PageUp; DOM scrollTop changed from 127.5 to 501.5. Folded/unfolded the six real Claude tool steps twice in each interaction run. Raw aggregate reports are in `performance-results/`; they include long tasks and layout-shift source classes.
