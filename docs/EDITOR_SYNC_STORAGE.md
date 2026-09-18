# Editor synchronization and persistence

## Scope and reference

Reference inspected: [Tydora 5f924b2](https://github.com/zuorn/Tydora/tree/5f924b261ab7f9397f5831381e3d6909b5eccdb1/app/tydora-web/src/Editor).
Its `text-patch.ts` and `tryApplyExternalMarkdownPatch` demonstrate bounded block replacement
for external edits. This implementation uses the same general principle, but reuses unchanged
notebook nodes before parsing, rather than parsing the entire Markdown document first.
No wholesale editor migration or Tiptap version upgrade is involved.

## Ownership and complexity

- ProseMirror owns Markdown editing and selection; store-backed views own executable cell content/output.
- External synchronization indexes current top-level nodes and projected cells once: O(n).
- Only changed cell content is converted to HTML and parsed: O(changed content size).
- A same-cell update applies a ProseMirror content diff so selection endpoints map through the edit.
  Structural changes use closed top-level block replacement, preserving cell boundaries.
- Temporary synchronization space is O(n + changed content size), in addition to the retained document.
- Mermaid is imported on first nonempty preview, not at editor-module evaluation. Stale preview results
  are discarded. This is demand loading, not viewport virtualization.

## Save lifecycle

All save entry points enqueue immutable snapshots before awaiting I/O. Each queued edit receives
a session-local revision. One writer drains snapshots; each notebook keeps at most its newest queued
snapshot alongside any in-flight snapshot. Completion acknowledges only the revision actually written.

`queued -> writing -> committed` or `writing -> retry -> failed/dirty`.

Failed snapshots remain queued after bounded retries. Flush/pause propagate failure instead of claiming
the notebook is safe to leave. A failing notebook does not prevent attempts to save other queued notebooks.
The automatic scheduler coalesces edits for 250 ms, with a 1 s max-wait scheduling bound; storage latency
and retries can exceed that bound. Manual save and flush bypass the debounce.

Notebook snapshots are always saved locally, including large outputs. IndexedDB writes acknowledge
transaction completion and reject aborts. File metadata and file content use their existing shared
transaction. Compact JSON avoids formatting-related allocation; full snapshots are still O(total bytes)
to serialize and write. Queue operations are O(1) per enqueue; draining visits pending work without
retaining an unbounded revision log.

## Verified scenarios

- 1,000-cell document, one changed cell: exactly one parse; identical second sync: zero parses.
- Nonempty selection survives text inserted before it within the same cell.
- Existing title, blank-cell Enter, reorder, undo and cell-type round-trip regressions.
- Latest queued snapshot wins; immediate saves wait behind the in-flight writer.
- Transient failure retries; exhausted retries retain dirty data; failed pause does not disconnect.
- A later edit supersedes the snapshot captured at the start of pause.
- Request success alone does not acknowledge durability; abort rejects the write.
- Mermaid preview ignores an older asynchronous result.

## Remaining architectural limits

### Source-cell editing progress

Executable code blocks can now be converted into a literal Markdown source cell by Backspace at
the start of code or the existing block deletion action. The opening fence loses one backtick;
language, code and cell ID survive. Undo restores the latest store-backed code. Editing is published
to the in-memory store immediately, avoiding delayed code updates overwriting structural conversions.

The `Cell source` action opens a selected Markdown cell as literal source. Source mode persists through
reloads. Preview recognizes a repaired standalone code fence and routes Mermaid fences to diagrams,
not the Python executor. Browser keyboard verification covers breaking the fence, source focus/caret,
repairing the fence and returning to a code editor without disturbing adjacent cells.

This does not yet prove full-document source editing or lossless round trips for arbitrary mixed
Markdown. Remaining goal checks include mixed/nested fences, read-only and IME interactions,
undo/redo focus across editor types, full-document source mode, broader chart/table interactions,
and the performance/persistence limits below. The overall optimization goal remains active.

Mixed top-level fenced blocks now share a single forward scanner across rendering and source
transitions (O(source length) time and O(source length) output storage). Backtick and tilde fences,
longer delimiters, CRLF and fence metadata are covered. A Mermaid example inside an outer code
fence remains code. Static fenced code inside a Markdown cell uses a lightweight ProseMirror node,
not an additional executable CodeMirror instance. Unchanged fence source is retained on serialization;
edited content grows delimiters when necessary. Mermaid source controls now respect read-only mode.
Thirteen focused tests cover scanning, source transitions and Mermaid controls. This does not yet
cover full CommonMark list/blockquote nesting, full-document source mode or browser IME behavior.

Code node views and document projection now share a code-attribute decoder. Already-decoded output
arrays are reused without copying; encoded HTML outputs are decoded at the boundary. This fixes
output loss on import and encoded source/incorrect output-only mode before store hydration. Code
node HTML serialization now emits the same discriminator its parser accepts, preventing whole-block
loss on HTML round trips. Focused attribute, source-transition and document-sync regressions pass
(28 tests, including the 1,000-cell single-change case).

This is not a claim of globally optimal algorithms or crash-proof persistence. Full snapshot writing,
task derivation and initial document mounting remain. Notebook-list metadata and the notebook file are
still separate transactions. Revisions coordinate one service instance, not concurrent browser tabs.
Browser/process termination before pending work commits can still lose edits. Incremental cell storage,
cross-tab conflict control, and viewport mounting require separate schema/lifecycle work and recovery tests;
they are not silently approximated by this change.
