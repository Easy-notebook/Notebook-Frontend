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
1,408.42 kB chunk; total functionality is deferred, not removed.

The subsequent viewer boundary change defers spreadsheet, Word and React sandbox modules in both
preview panes. NotebookApp is now 2,716.76 kB (gzip 888.31 kB), approximately 43% less compressed
main-chunk payload than after the export change. Viewer chunks are loaded only when selected, with
loading feedback and a reset-on-file-change error boundary. Two tests cover demand loading and failed
module isolation. Production build passes. These measurements are bundle sizes, not browser startup
or scrolling benchmarks; they do not imply all cell editors are virtualized.

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

Literal text serialization now escapes Markdown syntax, entities and unmarked automatic-link
patterns so switching modes does not reinterpret plain text as formatting, lists, formulas or links.
Code marks serialize the literal payload before other formatting wraps it. Notebook titles remain
plain-text fields rather than receiving Markdown escapes. Escaped dollars no longer trigger display
math paragraph splitting. Twenty-eight inline/parser/title tests cover these cases; this is not yet
a complete guarantee for mixed mark boundaries, merged table cells or arbitrary whitespace.

Emphasis/strike serialization now places boundary whitespace outside delimiters and avoids emitting
empty delimiters for whitespace-only marks. This preserves visible text and formatted non-whitespace
content; styling of whitespace itself is not represented by Markdown. A stable-revision run of the
complete Editor directory passes 17 files / 90 tests after this change, including incremental sync,
source transitions, literal text, title and diagram tests.

Code-cell navigation now uses one shared router with a cell-ID map instead of a window listener per
mounted cell. Dispatch does average O(1) lookup plus callbacks for the target cell's views, rather
than visiting every cell. A 1,000-subscriber test verifies one listener, target-only delivery, invalid
event filtering and final cleanup. The unused prior navigation hook is removed. Preview panes now
select only their required store fields, avoiding subscription to unrelated notebook edits. This
does not remove the remaining O(cell count) React mounting cost or constitute viewport virtualization.

Raw and attachment node views now select their own cell through the shared immutable-snapshot ID
index instead of subscribing to the whole store and independently scanning the cell array. The index
still costs O(cell count) once per new snapshot; individual lookups are average O(1). Attachments no
longer adopt another cell by matching content. Raw nodes retain content before store hydration and
keep in-progress drafts across node refreshes. Both respect the notebook read-only view policy.
Four component tests cover hydration, draft refresh, read-only Raw controls and duplicate attachment
text with distinct IDs. Draft conflict reconciliation beyond explicit local save remains unimplemented.

Raw-node contents are decoded only at their HTML import boundary. Document projection no longer
decodes them again, so literal `%20`, `%2520`, backslashes and markup survive HTML export/reimport.
Redundant render-time attribute encoding is removed; the node attribute codec owns serialization.

### Browser mount baseline (2026-09-19)

An isolated headless Chromium profile against the local Vite development server measured document
replacement with store updates enabled, followed by two animation frames. Cases ran sequentially
in one session; timings include React/store work and are not statistically stable production metrics.

| Body cells | Dispatch ms | Two-frame elapsed ms | CodeMirror instances | Editor DOM nodes |
| --- | ---: | ---: | ---: | ---: |
| 100 simple Markdown | 15.0 | 41.8 | 0 | 214 |
| 1,000 simple Markdown | 11.9 | 90.4 | 0 | 2,014 |
| 20 Python code | 69.8 | 345.2 | 20 | 1,354 |
| 100 Python code | 1,491.1 | 1,553.4 | 100 | 6,714 |

These counts confirm that offscreen code editors are all mounted. The next rendering change should
defer CodeMirror creation while preserving cell/store identity, with explicit activation on viewport
entry and keyboard navigation. Tests must cover navigation to an unmounted editor, editing/undo,
IME and scroll stability before claiming full virtualization. A bounded mount/unmount policy must
also preserve CodeMirror history if editors are later evicted; merely hiding DOM is insufficient.

### Deferred CodeMirror activation

Code editors now use a one-way deferred-to-active lifecycle. Offscreen cells show literal code;
viewport proximity, pointer/focus or targeted cell navigation activates CodeMirror. Selected and
detached editors activate immediately. Navigation intent is replayed after creation, and activated
instances are retained to avoid dropping undo/IME state on scroll. The shared visibility observer is
released per editor after activation. Cell models/toolbars still mount eagerly.

The same Chromium development benchmark mounted 3 CodeMirror instances for 100 code cells instead
of 100, with 5,065 editor DOM nodes instead of 6,714. Two runs measured 147.5 ms and 331.7 ms to two
frames versus the earlier 1,553.4 ms single-run baseline; do not interpret these as stable speedup
ratios. Actual navigation to deferred cell 99 activated and focused it, and real typing plus Cmd-Z
restored its content. Ten code-cell tests pass. Full IME/scroll stability and bounded memory after
visiting every cell remain unverified; this is progressive mounting, not complete virtualization.

Navigation focus is now owned solely by the editor-activation lifecycle, including the interval
between activation request and CodeMirror creation. It keeps the newest pending direction, routes
subsequent navigation after creation and cancels queued focus on unmount. The duplicate ViewModel
navigation subscription/focus implementation is removed. Twelve code-cell tests pass, including
activation-window navigation and unmount cancellation regressions.

Code execution/navigation, notebook keyboard handlers, fence breaking, source undo and Raw-cell
shortcuts now share a composition-input guard. It respects native isComposing, IME keyCode 229 and
editor composition state where available. Thirteen targeted tests cover shortcut non-interference
and Raw view regressions. This is event-level verification, not a real OS IME end-to-end guarantee.

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

### Integrated verification at `69da4a6`

The fixed-revision editor, deferred-viewer and export regression run passes 25 files / 118 tests.
`npm run build` succeeds; large-chunk warnings remain. NotebookApp is 2,717.43 kB
(888.72 kB gzip); deferred modules still contribute to total downloaded code when used.

| Use case | Implemented / evidence | Remaining acceptance gate |
| --- | --- | --- |
| Open a notebook with many code cells | Progressive activation; browser sample mounts 3 of 100 CodeMirror instances | Bounded eviction preserving history, composition and scroll anchors |
| Edit one cell in a large document | Changed-block projection and selected-cell source tests | Array-index rebuilding and full save snapshots still scale with document size |
| Navigate to an offscreen code cell | Deferred focus lifecycle tests; browser typing and undo smoke check | Cross-cell rapid navigation and real OS IME end-to-end coverage |
| Switch Markdown/source without corrupting text | Structural parsing, literal text and marked-whitespace regressions | Full-document source and rich table fidelity |
| Save reliably while editing | Serialized save queue and durable transaction completion | Atomic file/list metadata, cross-tab conflict handling and crash recovery |

These gates distinguish verified improvements from architectural work still pending; neither the
test count nor successful bundling establishes globally optimal runtime or lossless persistence.

### Fence deletion inside containers

Backspace at the start of a static code block now resolves the selected node through its structural
path, including lists and blockquotes. A shared serializer fence transform removes one opening
delimiter only from that node; container prefixes are not reimplemented in the transition handler.
Comparing the original and modified cell projections locates the source caret after prefix insertion.
The operation projects only the owning cell (twice), not the whole notebook; deeply nested container
serialization still builds intermediate strings and is not claimed to be globally optimal.

Seven related test files / 57 tests pass. New cases exercise the Backspace keymap, quote/list/mixed
nesting, identical sibling fences, cell identity, neighboring cells, undo/redo and repaired-source
preview. These are editor integration tests, not browser/OS input validation.

### Local table input and alignment

Table input no longer schedules a timer or scans all document paragraphs. It checks the edited
paragraph and its immediate sibling inside the same parent; unrelated typing does not construct
a candidate transaction. Detection depends on local text and ancestor depth rather than notebook
paragraph count. ProseMirror transaction application, rendering and store synchronization still
have their own costs; this does not make the complete keystroke O(1).

Enter-created and separator-created tables share the notebook Markdown parser and one transaction
constructor. Empty columns and escaped pipes in headers survive. Row insertion/deletion delegates
to ProseMirror's table-aware commands, including logical width for merged cells. Read-only and
composition guards apply before input handling. Column alignment is persisted through validated
cell attributes and Markdown alignment markers, with source/preview/HTML round-trip coverage.

Remaining table fidelity gaps include merged-cell source representation, multi-paragraph cells,
inline-code pipes and line breaks. Column-level Markdown alignment cannot express arbitrary
per-cell alignment. These are not claimed fixed by the input-path refactor.

The final related regression run passes 8 files / 65 tests. Production bundling succeeded before
the final unrelated-input allocation guard was added; the guard is covered by the final test run.
The full TypeScript check remains failing (316 diagnostics); no diagnostic names TableExtension.
