# Browser interaction verification — 2026-10-27

Executed with the actual in-app browser at
`http://127.0.0.1:5174/tests/browser/lexical-editor.html`, using the real editor and
cell components. Edits used the disposable keyboard fixture, not the user's
notebook. Keyboard checks inspected rendered DOM/selection in addition to the
accessibility tree.

| Area | Browser checks and observed result |
| --- | --- |
| Code boundaries | Paragraphs inserted before/after code using Enter and gutter actions. Text stays outside CodeMirror. |
| Cross-cell caret | Rich-text boundary arrows enter code at the corresponding edge; code edge arrows return to preceding/following text. |
| Code Backspace | First-position Backspace opens the editable fence source; undo restores the executable code cell and source. |
| Rich-text Backspace | Backspace adjacent to code focuses code without deleting it. Heading/quote start Backspace produces a paragraph; undo restores formatting and neighboring content. |
| Heading | Enter creates body text; merging back with Backspace and undo preserves heading content. |
| List | Enter creates an item; start Backspace exits the list; undo restores the item. |
| Table | Enter inserts a paragraph inside the cell; Backspace rejoins; Tab moves to the next cell; undo preserves table shape. |
| Formula | Input Enter saves the formula without splitting the notebook title; undo restores the original expression. |
| Mermaid / raw source | Enter and Backspace affect only the source field; undo restores the deleted character. Mermaid Escape returns to preview. |
| Image | Markdown-input Enter saves without affecting notebook text; undo restores the original image description. |
| Gutter | Duplicate and undo; clipboard cut and undo; paragraph insertion on both sides of code; pointer drag across code and undo; generated block link verified. |
| Structured blocks | Callout conversion, disclosure collapse/reopen, 2→3 columns, stack back into document, consecutive foreground/background changes. |
| Read-only | Gutter and column controls disappear and return when editing is re-enabled. |

Fixes discovered by these checks: code deletion at rich-text boundaries, missing
focus transfer out of CodeMirror, unseeded history after external reset,
formula/image Enter propagation, quote/heading merging across cell wrappers,
selection Markdown export and continuous color input handling.

These are editor interaction checks; backend execution, agent inference and
persistence to a real notebook were not part of this fixture run.

## Viking rich-document refinement (2026-10-27)

Compared against Silan-Viking `desktop/src/styles.css`, `plugins/block-actions.css`,
`interaction/TableEditingController.ts`, and `plugins/TableToolbarActions.tsx`.

- Removed the Lexical host's legacy `markdown-cell prose` classes. Scoped rich-cell
  typography now owns paragraph, heading, list, quote, rule, link and table styles.
  Explicit inheritance prevents the application's universal 12px rule from resetting
  every Lexical text span. Browser computed values: body 16px, H1 32px, H2 26.4px,
  H3 20.8px; embedded CodeMirror remains 13px.
- Matched neutral block/insert menus, callout padding, media corners and formula
  selection feedback; added visible checklist markers and completed-item styling.
- Adapted Viking table controller to existing notebook table alignment state.
  Commands push independent undo steps, recover a paragraph after deleting the
  only table, and reject mutations in read-only mode.
- Browser: selecting body text shows themed formatting controls; Underline changes
  the selected text and Cmd+Z removes it. Toolbar position uses measured width.
- Browser: Insert row below changes 2 rows to 3, Cmd+Z restores 2; center alignment
  applies to both header and body paragraphs. Clicking a checklist marker updates
  aria-checked from false to true and displays completed styling.
- Checked light and dark rendering. Proof: `/tmp/notebook-viking-refined.png` and
  `/tmp/notebook-viking-table.png`. Tests used disposable fixture cells, not user data.
- 65 scoped editor/code-cell tests passed. Whole-project TypeScript retains existing
  errors outside Lexical; no errors under Lexical in `/tmp/refine-ts3.log`.
- Browser: switching to read-only removes the contextual toolbar and sets the
  document's contenteditable to false. Returning to edit mode restores editing.
- Fixed a development hot-reload Context identity split by moving session Context
  and its hook into a non-component module. Reloaded the fixture, then triggered
  another provider-module update: all 8 headings remained mounted and editing
  remained available.

## Left gutter and block movement correction

- Removed native title tooltips from block controls; matched Viking's compact
  neutral 42x26 control frame and separate grab handle.
- Menu now opens to the left, measures its actual height, and narrows when the
  left lane is smaller than 288px. Browser measured menu right=262px versus
  control left=270px; it does not cover the handle.
- Drop hit testing uses block geometry, including gutter and paragraph gaps;
  it no longer requires hovering a painted content element. Pointer capture,
  Escape/pointercancel/window blur cleanup, and source-version validation protect
  the drag lifecycle.
- Browser: dragged “代码前段落” down past the code cell and “代码后段落” up past it,
  keeping the pointer in the left gutter. Each moved to the intended position;
  Cmd+Z restored the original order and retained code content.
- 14 geometry/block transaction tests passed. Screenshot:
  `/tmp/notebook-left-block-menu.png`.
