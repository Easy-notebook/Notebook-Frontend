# Real Agent answer verification — 2026-10-28

Surface: `http://127.0.0.1:5174/tests/browser/agent-live.html`. The disposable notebook contains notes and an AAL calculation; all model calls below used actual Codex / Claude Code via the configured AAL worker, not replayed token fixtures. No cell modification or execution was requested. This does not establish EasyNet daemon admission or remote deployment.

## UI changes

- Removed the nested answer card border/background. Shared AgentTurnHeading combines actual provider logo/name, state, start time and elapsed time in one row in cells/chat/details.
- Stable Citation component and context preserve DOM identity and focus while source selection/hover and streamed Markdown update. Markdown parsing is memoized independently of preview interactions.
- Generating status stays in the turn heading. Inactive footer actions remain invisible while streaming instead of moving visibly below incoming text; removed redundant moving stream dot.

## Browser observations

- Claude completed a long 12-section response (49.8s), with actual read_cell evidence and source citations.
- Claude subsequent long stream: bottom initially followed (scrollTop 1303.5 / end 1304). Home paused at top. Card and inline citation previews opened/closed. Once citation was in view, scrollTop stayed 247 while content grew from 3537 to 4899 characters. Click-induced scrolling to bring controls into view was excluded from this stability comparison.
- Claude cancellation from details stopped at 54.2s; chat and details both showed cancelled and retained identical answer text. Regeneration started a new real call; chat stayed at scrollTop 0 while content grew from 5442 to 7182 characters. Cancel from chat stopped that request.
- Codex bottom followed (1037.5 / end 1038); Home paused at 0 while content grew. Source cards and citations opened real read snapshots. Citation preview remained open with scrollTop 328.5 while content grew from 2187 to 2574 characters.
- Codex details followed growth (1184 / end 1184, later 1470.5 / end 1471). Details cancellation stopped at 100s; both views showed cancelled and identical answer text. Regeneration issued a new request, read sources again and streamed; chat cancellation stopped it.
- Final version Claude response completed in 33.6s. Its regeneration completed in 26.0s before the intended cancel click, so that last click is NOT counted as a cancellation test. History remained at scrollTop 0; both answers matched exactly between details and chat.
- Computed nested answer border is 0px. Screenshot: `/tmp/agent-answer-inline-header.png`.

## Measured performance and limits

- Before hiding the moving footer: 119.9s, 7190 frames, max 18.7ms, no frames >33ms, no long tasks. Unexpected layout shift 0.1047; main streaming shift sources included footer/stream dot.
- Final capture: 48.2s, 2890 frames, max 18.8ms, no frames >33ms. Unexpected layout shift 0.03569; footer and stream dot absent from shift sources. Remaining shifts include initial conversation growth/composer and action state transitions. These are different real responses, not a controlled throughput benchmark; do not claim zero CLS or identical workload speedup.
- Raw reports: `performance-results/agent-answer-stream-before.json`, `performance-results/agent-answer-stream-final.json`.
- 17 focused tests pass (answer 4, reading position 1, session lifecycle 12), including citation DOM identity/focus through hover, preview and streaming changes.
- Backend typecheck passes. Whole frontend typecheck retains unrelated existing errors; no diagnostic names the changed answer/header/detail/cell files.
