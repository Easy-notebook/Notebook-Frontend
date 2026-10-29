# Agent following / reading verification — 2026-10-28

Real browser UI: `http://127.0.0.1:5174/tests/browser/agent-live.html`.
Both providers used their actual backend, not fixture response data. Prompts requested list_cells, reads of title/notes/calculation and a long Chinese explanation with repeated reads. No notebook edits or execution were requested.

## Observations

| Scenario | Measurements (CSS px) |
| --- | --- |
| Claude initial following | scrollHeight 908 → 1548; bottom gap 0 |
| Claude reading after PageUp | scrollTop 704; paragraph “第3节：单元格 ID 与索引” offset 20.109375 stayed unchanged as height grew 2304 → 3667 |
| Claude return to latest | gap 0.5 at height 3667; continued streaming reached height 4810, gap 0 |
| Codex initial following | height 1262, top 830, viewport 432, gap 0 |
| Codex reading with new actions | height 1279 → 1682; paragraph “第 2 节：认识单元格的职责” offset 88.140625 → 87.9375; scrollTop compensated 418 → 469 |
| Codex return to latest | height 1699 → 1951, gap 0 at both observations |
| Detail JSON | actual list_cells JSON expanded without jumping to bottom; action viewport height 585, viewport 280; return-to-latest set top 305, gap 0 |

The details outer history fit the viewport in these one-turn runs (549px); nested action JSON overflow was exercised. Both surfaces use the same ReadingPosition controller. This is sample-based real-browser validation, not a claim that every animation frame has zero displacement.

Claude completed its long answer. Codex was cancelled through the UI after verification and returned to an editable composer. Screenshot: `/tmp/agent-follow-latest.png` (Codex details, real JSON, compact borderless Thinking and return-to-latest button).

## Implementation / checks

- Shared following/reading lifecycle; upward wheel, keyboard and touch intent pauses following before resize delivery.
- ResizeObserver follows the end only in following mode; reading mode compensates the visible anchor.
- JSON disclosure anchors its clicked control. Return-to-latest restores following.
- Button is outside scroll content, so showing it does not move the content.
- Thinking panel border/shadow removed and spacing reduced.
- Targeted Vitest: 7 tests passed across ReadingViewport, AgentThinking and AgentCell input.
- `git diff --check` passed. Full `npm run type-check` failed with errors in other areas including Notebook data-table/workflow, UI/fluent and stream/phase modules.
