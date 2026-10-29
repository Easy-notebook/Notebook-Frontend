# Textus writing verification — 2026-10-28

Reference: https://github.com/CatVinci-Studio/Textus, commit
`7a6177d974a1dcc253255415608806885401889d`.
Watched the repository video at 7.81, 8.86, 9.91, 10.96 and 12.01 seconds using
its native video controls. The relevant sequence is headings, bold text and a
continuing quote, not AI completion.

Browser: actual application components at
`/tests/browser/lexical-editor.html?verification=textus-writing`.
All edits below are in the disposable fixture, not a user notebook.

## Verified with browser input

- Typed character by character: `# Hamlet`, Enter, `## Act III, Scene 1`, Enter,
  `**HAMLET.**`, Enter, `> To be, or not to be, that is the question:`, Enter,
  `Whether 'tis nobler in the mind to suffer`.
- Heading conversion updates the outline. Bold delimiters appear as hints on the
  current line and disappear when leaving it. They are absent from document text.
- The quote contains two text spans separated by a real line break. Its computed
  font weight is 400: the preceding bold format does not leak into the quote.
- A second Enter on an empty quote line exits to a normal paragraph.
- Prose apostrophes stay literal; no closing apostrophe is appended to `'tis`.
- Replace All changed both repeated headings; one Cmd+Z restored both.
- Source split view updated a title live; Cmd+Z restored it.
- Cmd+K opened and applied a link to selected prose.
- Actual Claude Code request returned a writing proposal. Accepting it preserved
  the preceding heading and following paragraph. One Cmd+Z restored the original.
- Automatic completion received a real Claude Code continuation in gray. Its Tab
  command initially exposed a nested transaction error; the regression test now
  executes the keyboard command rather than testing the controller in isolation.
  Browser retest passed: Tab inserted the actual Chinese continuation; one Cmd+Z
  restored the original paragraph.

Evidence: `/tmp/notebook-textus-writing-flow.png`.

These checks cover the recorded paths; they do not establish every Textus feature,
IME combination or long-document performance target. Existing code/Agent unit
regressions are run separately from this visual fixture.


## Body-flow editable Markdown source

Verified in the browser fixture on 2026-10-28:
- Source is an inline, statically positioned span inside the original paragraph;
  there is no textarea, input overlay or portal. Long destinations wrap and the
  following punctuation stays in the paragraph.
- Click a link, use arrow/Shift+arrow to select its URL, type a replacement,
  then arrow past the closing parenthesis: the rendered anchor uses the new URL.
- Select all of `**加粗**` using Shift+arrow, type `*正文斜体*`, and move right:
  the result is an EM element and surrounding prose is unchanged.
- Source first/last offsets remain reachable. Replacing all selected source
  retains the scope container, and browser navigation stays on the editor.

## Live block grammar (2026-10-28)

Verified in the browser fixture with actual selection, arrow, Backspace and typing input:
- Delete `## `: H2 becomes P, caret stays at offset 0. Insert `### `: H3 immediately, caret offset 4.
- Delete `> `: BLOCKQUOTE becomes P. Restore it: BLOCKQUOTE immediately, caret offset 2.
- Delete `- ` on first list item: UL becomes P. Insert `1. `: OL immediately, caret offset 3; adjacent items remain.
- Traverse link label and URL with arrow keys; edit both in place. Removing closing `)` makes the label ordinary text (bare URL still autolinks under existing GFM grammar). Restoring it recreates the label link with the edited href.
- Source remains in the document flow; no floating input. Code cell remains present.
- Regression suite: 25 tests across WritingInteractions and MarkdownTriggers; includes list split/merge order, live block classification and link delimiter/URL changes.

## Muted source delimiters and list layout (2026-10-28)

- Inspected first, second and nested list item source in the browser: continuous list spacing, original text indentation, no extra parent bullet while editing the nested item.
- Complete link source spans contain `[`, `](` and `)`; computed marker color is rgb(156,163,175), font size 13.12px for 16px text. The marker under the caret receives gray emphasis without green background.
- Plain click on an editable link opens source, cursor style is `text`; tab count remained 6 before/after. Link navigation is owned by NavigationPlugin; only modifier-click navigates while editing.

## Unified heading, quote, bold and inline-code markers (2026-10-28)

- Browser keyboard tests removed and restored `## `, `> `, closing `*`, and closing backtick. Block types and inline formats switched immediately, with caret retained in the active source.
- ArrowRight/ArrowLeft round trips tested heading→paragraph→heading, quote→next heading→quote, bold→plain text→bold, inline code→plain text→inline code.
- Heading text coordinates before/after source collapse: x=320, y=274.2421875. Quote text coordinates: x=338, y=578.5859375. Block markers occupy the gutter.
- After leaving bold/code, typed probe characters had no inline style and normal text formatting. Source completion uses controlled insertion for collapsed selections too; otherwise closing punctuation at a styled source boundary could escape its source wrapper.
- 27 relevant regression tests passed, including closing-delimiter restoration and clean collapsed text styles.

## Structural source editing and in-flow markers (2026-10-28)

Supersedes the earlier gutter-alignment requirement: the user requested ordinary inline source layout. Removed absolute marker positioning for headings, quotes and lists. Heading markers now begin at the heading left edge; quote markers participate in normal text flow. Empty headings show level-specific CSS placeholders; DOM text excludes the placeholder, so it is not serialized.

Browser checks:
- Heading mid-text Enter splits `研究方法` into `研究` and `方法`; Cmd-Z/Shift-Cmd-Z restore/reapply the split. End Enter creates a paragraph; Backspace merges it back.
- Quote end Enter followed by `q` keeps `q` on the new quote line. Empty element selections do not trigger premature source expansion.
- Bold and inline-code boundary Enter splits the paragraph; Backspace rejoins it with all text retained.
- Shift-arrow selection crossing plain text and bold source deletes exactly the selected text; undo/redo restore/reapply it.
- Empty H2 source displays `请输入二级标题`; typing replaces the visual prompt without storing it. Marker computed position is `static`.

Real OS Chinese IME validation remains unverified. Ctrl-Space followed by physical pinyin keystrokes produced Latin text; accessing SystemUIServer to inspect input sources was denied by computer-control permissions. Direct insertion of Chinese text is not counted as IME coverage.

## Table top toolbar (2026-10-28)

Clicking a table shows a gray, table-width top bar: table operations menu, left/center/right column alignment, and delete at the far right. Browser verified center alignment, inserting a third row, deleting the table, undo restoring it, and clicking prose hiding the toolbar. The bar reserves space above the active table rather than covering its preceding heading. Existing TableEditingController owns all mutations; its 3 regression tests passed.

## 2026-10-28 — table interaction and layout verification

Actual IAB interactions on the lexical-editor fixture:
- Tab advances to the next cell; final-cell Tab appends a row; Shift+Tab returns to the previous cell.
- Enter creates a second paragraph inside a cell. Backspace removes the entered character, then merges the paragraph without losing the original text. Undo/redo restore the edits.
- Both mouse drag and Shift-click select the two data cells. Backspace clears those cells while preserving headers and table structure; undo restores `样本` / `9`, redo clears them again.
- Insert/delete column preserve existing content and configured widths; insert/delete row operate on the selected row. Undo restores deleted rows.
- Column-boundary drag changes widths from 146/146 to 186/106. Undo restores 146/146; redo restores 186/106.
- Toolbar top 483.93px follows heading bottom 467.68px; toolbar bottom 517.93px precedes table top 519.93px: neither preceding text nor table content is covered. Table spacing is reserved consistently; toggling selection no longer moves cells underneath a drag gesture.
- Added visible cell-selection styling (previously selected cells had no configured theme highlight).

Implementation boundaries:
- `TableColumnResizeController` owns idle → preview → commit/cancel, event cleanup, and transient colgroup preview. Start/commit cost O(columns); each preview writes only two column styles, O(1) application work. Browser table layout cost is not claimed constant.
- `FrameTask` coalesces resize/scroll/pointer bursts into one animation-frame callback. Toolbar coordinates use equality checks to avoid unchanged React updates.
- Document/history mutations happen at gesture release, not on every pointer event. No per-row width update loop remains.
- Targeted table tests: 8 passed; targeted ESLint passed. Whole-project TypeScript checking still has unrelated existing errors; no diagnostics in the table modules changed here. No large-table FPS benchmark was performed.

Screenshot: `/tmp/notebook-table-verified.png`.
