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

### Combined verification (2026-09-19)

After the source/fence, visibility and embedded read-only changes, the complete Editor test directory
passes: 14 files, 59 tests. Production Vite build passes but retains oversized-chunk warnings. An
isolated Chromium session at `/workspace/smoke-notebook` verifies actual keyboard Backspace from
JavaScript code into broken-fence source: focus moves to the textarea at offset 2, the next cell is
unchanged, and inserting the missing backtick plus Preview restores the original code. This browser
check does not cover whole-document source, IME, detached windows or real scrolling performance.

Export handlers now load format converters on demand. Export UI keeps pending work visible,
disables duplicate actions and exposes failures for retry. Three focused tests cover loading and
failure lifecycle. Production build reduced NotebookApp JS from 6,330.05 kB (gzip 2,170.75 kB) to
4,857.07 kB (gzip 1,549.06 kB), about 29% less compressed main-chunk payload. PDF export is a separate
1,408.42 kB chunk; total functionality is deferred, not removed. Word libraries still have static
document-viewer consumers. This measurement is bundle size, not a browser startup-time benchmark.

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

For code directly inside a Markdown cell, Enter inserts a code newline and Mod-Enter exits into
a paragraph in the same cell. Backspace at the start converts the owning cell into literal source,
removing one opening fence character while preserving siblings, cell identity and undo. Conversion
serializes only that cell, O(cell content length), and does not project the entire notebook. Deeper
list/blockquote nesting still requires a structure-aware source mapping before this command applies.

Mermaid layout is now visibility-gated with a 300px prefetch margin. Offscreen edits do not schedule
layout; the newest source is rendered when visible. A completed preview is reused on scroll reentry.
All mounted previews share one IntersectionObserver and release it after the last unmount. Tests
cover deferred rendering, stale-result suppression, reentry reuse and 1,000-preview observer cleanup.
This reduces expensive layout work, not the O(number of mounted previews) React/observer bookkeeping;
it is not full notebook virtualization. Environments without IntersectionObserver render eagerly.

Inline Markdown rendering now uses the existing marked dependency instead of three formatting
regular expressions. Links, strike,
nested emphasis and variable-length code spans are covered; serialization retains link destinations,
titles and strike marks. Raw inline HTML is escaped and explicit link schemes are restricted to
HTTP(S), mailto and tel. Seven inline tests and fifteen source/title regressions pass.

Block serialization now preserves ordered-list start numbers, indents multiline/list-child content
under the actual marker width, and prefixes every line of quoted content. Nested fenced code reuses
the same fence serializer rather than being flattened into text. Three tests parse the generated
Markdown with marked to verify list/quote/code hierarchy; ten source-transition regressions also pass.
The block parser has subsequently been replaced by marked tokenization with notebook-specific
renderers for headings, code, Mermaid, images and math. The handwritten parser and placeholder
replacement passes are removed. A real Tiptap source/preview round-trip test verifies nested lists,
ordered starts, quoted code, images and math. Boundary tests cover repeated heading IDs, mixed tables,
literal code examples, CRLF fence source and incomplete fences. The migration passed the then-current
69-test Editor suite; added nested and boundary tests pass separately. This is not a proof of arbitrary
Markdown losslessness or full-document source mode, which remain open goal items.

Opening selected-cell source now serializes only that cell rather than projecting/searching the
entire document. A 1,000-cell test verifies only the selected paragraph and text are serialized.
The editor also synchronizes runtime readOnly prop changes into Tiptap without emitting a document
update. A runtime React context propagates this policy to embedded code/hybrid views without changing
persisted cells: code input and execution keyboard callbacks are removed, mutating toolbars/deletion
are hidden, and reading/copying remain available. Component tests cover switching read-only on and
off. Browser-level portal behavior and already-open detached windows still require verification.

This is not a claim of globally optimal algorithms or crash-proof persistence. Full snapshot writing,
task derivation and initial document mounting remain. Notebook-list metadata and the notebook file are
still separate transactions. Revisions coordinate one service instance, not concurrent browser tabs.
Browser/process termination before pending work commits can still lose edits. Incremental cell storage,
cross-tab conflict control, and viewport mounting require separate schema/lifecycle work and recovery tests;
they are not silently approximated by this change.
