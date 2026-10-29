# Thinking motion: real providers, 2026-10-28

Browser-operated existing live notebook; actual Codex and Claude Code requests, not timed example steps. Each first workload performed list_cells plus nine read_cell actions and streamed a long answer. Subsequent long-answer requests exercised cancellation from opposite surfaces.

## Fixes

- Keep action rows keyed by their real IDs when the recent-four window advances. An expanded older row stays visible rather than being discarded, preserving its JSON inspection state.
- Keep the list mounted during header folding. Animate CSS grid height and opacity over 200/150ms; folded content is inert and aria-hidden, with delayed visibility hiding for the closing transition. Reduced-motion preference disables the transition.
- Preserve JSON DOM across answer chunks, payload replacement and folding; parse/highlight only when payload values change.
- Header distinguishes waiting for approval and cancelling from normal Thinking. No synthetic progress or thought text.

## Browser evidence

- Claude's 10-action completed run showed the expected +6 more and latest four actions in chat and details.
- Expanded calculation read_cell JSON, folded and reopened the header: the same payload remained open with byte-identical displayed JSON.
- Browser observed collapsed height 0, grid rows 0px, inert=true, and configured grid/opacity transitions.
- Claude cancelled from details during a new 9-read/long-answer run: chat and details changed to Cancelled after 40s; pixel animation was none and active=false.
- Codex cancelled from chat during a read/long-answer run: details and chat both reported Cancelled after 49s and active=false. Partial answers remained visible.
- Screenshots and DOM observations establish visible behavior; this is not a perceptual claim that every rendered frame was perfect. No full browser native trace was available.

## Metrics and regression

202.7s page-level capture: rAF P99 17.7ms, maximum 50.0ms, zero intervals strictly above 50ms. Unexpected layout-shift sum was 0.1259 across the growing-answer/live-action test; do not claim zero layout movement. These results do not establish that earlier native/unattributed stalls are resolved.

17 targeted tests passed: 11 session lifecycle, 5 Thinking, 1 composer. Added a regression asserting that an expanded old row remains mounted and visible when six actions arrive, JSON result changes in-place, and the same JSON DOM survives collapse/reopen.

Raw report: [thinking-motion-real.json](performance-results/thinking-motion-real.json)
Screenshot: `/tmp/thinking-motion-final.png`
