# Reading position verification — 2026-10-28

The chat history and action history now have bounded independent scroll containers. Detail history uses the same ReadingPosition controller. The controller records the first visible content anchor on user scroll and a clicked disclosure on click; content resize compensates only that element's displacement. Native scroll anchoring is disabled within the managed viewport to avoid double compensation. It does not scroll to the bottom on each token or action.

History height is capped at 60vh; action history at 280px. JSON keeps its existing nested scroll box. Action preview retains the first four actions instead of replacing rows whenever an action arrives. More actions remain available using the explicit disclosure. Expanded rows retain their nodes.

Real browser tests used both Codex and Claude Code with actual list_cells/read_cell and long streamed answers. Claude was requested to append further reads after the first ten sections, exercising tool updates within a streamed answer.

| Check | Before | After | Anchor displacement |
| --- | --- | --- | --- |
| Claude reading paragraph | 10 paragraphs, scrollHeight 1344px | 32 paragraphs, scrollHeight 3125px | 0px (offset 58.96875px) |
| Codex reading paragraph | scrollHeight 1703px | scrollHeight 2173px | 0px (offset 30.75px) |
| Detail JSON disclosure | button y 323.375px | button y 323.375px | 0px |
| Initial chat JSON disclosure | button y 348.1875px | button y 348.1875px | 0px |

Both streamed-answer measurements retained scrollTop 412px and the same paragraph text. These are finite observed intervals, not a universal zero-layout-shift claim. Test runs were stopped after verification where still active. First preliminary run was invalidated by development hot reload while tests were edited; final measurements above were taken without code edits during the observation interval.

7 targeted tests passed: reading-anchor compensation/cleanup, five Thinking behavior tests, and composer input handling. The jsdom tests install a ResizeObserver stub; browser measurements exercise the native observer.

[Raw measurements](performance-results/agent-reading-position.json)
Screenshot: `/tmp/agent-reading-position.png`
