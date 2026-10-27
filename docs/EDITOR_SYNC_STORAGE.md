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

This section records the initial progressive-mount implementation; its one-way retention policy
is superseded by the suspension lifecycle described below.

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

Remaining table fidelity gaps include merged-cell source representation, multi-paragraph cells
and exact boundary-whitespace/newline preservation inside inline code. Column-level Markdown alignment cannot express arbitrary
per-cell alignment. These are not claimed fixed by the input-path refactor.

The final related regression run passes 8 files / 65 tests. Production bundling succeeded before
the final unrelated-input allocation guard was added; the guard is covered by the final test run.
The full TypeScript check remains failing (316 diagnostics); no diagnostic names TableExtension.

### Hard breaks in table source

Table-cell hard-break nodes serialize as `<br>` instead of physical newlines, with the table context
propagated through inline extraction. The Markdown renderer accepts only attribute-free `br` tags;
attributed tags and all other raw HTML remain escaped. Literal text such as `<br>` is still escaped
by text serialization, so it does not turn into a break on reload.

A failing regression first demonstrated physical row splitting. After the fix, 8 related files /
73 tests pass, including leading, repeated and trailing breaks, adjacent bold literal markup,
source/preview and persisted-cell reload round trips, and unsafe-HTML cases. This does not encode
multiple paragraph boundaries or merged cells in GFM tables, and does not establish browser/IME
end-to-end behavior.

### Mermaid rendering lifecycle

One render service now owns lazy renderer loading and the configure/render critical section.
Mermaid's configuration is global, so theme initialization and rendering are serialized together.
Each preview aborts obsolete requests when its source/theme changes, it leaves the visibility
margin, or it unmounts. Waiting jobs are held in a Set and removed in O(1) on cancellation rather
than handed to the library's uncancellable queue. An already-running library call still finishes;
its cancelled result is ignored. This bounds waiting work by active preview requests, not by the
number of edits made while a slow diagram renders.

Preview results are keyed by source and resolved theme. A mismatched SVG is hidden immediately,
and errors offer an explicit retry without an automatic retry loop. The strict security setting
is re-applied for each job. There is no cross-document SVG cache or duplicated persistent diagram
state. Ten targeted tests cover 1,000 cancelled queued edits, cancellation during loading/unmount,
load/render failure recovery, theme changes, stale result suppression and offscreen deferral.
These use a mocked Mermaid engine; actual diagram-layout and browser theme appearance require
separate visual verification.

The integrated editor run passes 24 files / 139 tests, and the production build succeeds with
existing large-chunk warnings. The full TypeScript check is still failing; no diagnostic names
MermaidPreview or MermaidRenderService.

### Cell-owned data during source transitions

Reconciliation now retains store-owned outputs, editability and business metadata when a document
projection changes the representation of the same cell ID. The projected type/content/language
and editorMode remain authoritative for the representation. Output arrays are retained by reference,
not copied into an additional source-mode snapshot. Explicitly cleared store outputs take precedence
over stale node attributes. Executable NodeViews continue reading live data from the store; their
ProseMirror attributes are not a second live output database.

Five model test files / 53 tests pass, covering code-fence break/repair across serialized-cell reload,
metadata preservation, undo/redo through the update/reconciliation path, and explicit output clearing.
Full-document source editing and cross-tab conflict resolution remain outside this reconciliation
change.

### Executable source origin and fence caret

Source nodes now carry a validated `sourceCellType` (`code` or `hybrid`), projected into source-mode
metadata and encoded in HTML. Repairing a standalone executable fence restores that subtype rather
than always creating a plain code cell. Source-mode lifecycle metadata is cleared on preview, including
when the user intentionally changes the source to prose or Mermaid. Outputs and business metadata
retain the store ownership described above; no additional output snapshot is introduced.

Fence-breaking caret placement uses the actual generated opening delimiter length. Code containing
fence-like lines can require four or more backticks, so the old fixed offset of two was incorrect.
The length is read from the opening run without scanning the entire generated source again.

Five model test files / 57 tests pass, including code/hybrid restoration across HTML and serialized-cell
reload, source-origin cleanup on prose conversion, and repairing a longer fence at the reported caret.

### Markdown presentation-only synchronization

The Markdown synchronization path now compares only node presentation fields: title cover/icon,
source origin, and the phase ID used to derive heading anchors. It no longer serializes arbitrary
business metadata or reparses Markdown simply because the document projection does not contain
those store-owned fields. Markdown wrappers persist phaseId so an external phase change can update
heading IDs even when the text is unchanged.

A 1,000-cell regression attaches business metadata whose `toJSON` would throw and verifies zero
metadata serialization, zero parseSlice calls and unchanged document identity. Additional tests cover
phase-owned heading IDs and source-origin changes. This removes metadata-payload-dependent work on
the Markdown path, not the O(cell count) scan/maps in synchronization; other cell types still need
their own presentation-field audit.

The final model regression run passes 5 files / 60 tests.

### Real-browser Mermaid verification at `e5ab294`

An isolated headless Chrome profile against the local development server rendered flowchart,
sequence and pie diagrams in both light and dark themes. All six SVGs had nonzero dimensions.
Flowchart node fill changed from `rgb(236, 236, 255)` to `rgb(31, 32, 32)` on theme change;
light/dark screenshots were inspected for the flowchart and sequence diagram. Source edits made
through Chrome's input API replaced the displayed labels. Invalid source showed an error without
the old SVG, and replacing it with valid source restored the diagram.

The first browser attempt found a blank page: the long-running Vite process still resolved the
renamed table extension to the removed `.tsx` file and returned 404. Restarting the verified project
dev server cleared the module graph; the importer then resolved `TableExtension.ts`. The same
browser checks passed after recovery. No compatibility file was added for the obsolete path.

Artifacts from this run: `/tmp/notebook-mermaid-browser-check.mjs`,
`/tmp/notebook-mermaid-browser-results.log`, `/tmp/notebook-mermaid-light.png`, and
`/tmp/notebook-mermaid-dark.png`. These are local temporary verification artifacts, not a persistent
CI gate. This smoke check does not cover every Mermaid grammar, accessibility, export fidelity,
production deployment or full-document source editing. The isolated browser was stopped afterward;
the project development server remains available on port 4173.

### CodeMirror suspension and restoration

Code editors now transition between deferred, active and suspended states. The shared visibility
observer stays subscribed; an offscreen view can be reclaimed after a 500 ms grace period only
when it is not selected/detached, focused, composing or awaiting navigation focus. Blur and
composition completion reconsider reclamation, and visibility/navigation cancel a pending timer.

`CodeEditorSession` owns a JSON snapshot of document, selection, history and folds, plus scroll
offsets and exact measured height. It does not retain the old EditorView or its callback-bearing
state configuration. Remount uses the current language/theme/read-only extensions. Changes made
in the store while suspended are applied as a common-prefix/suffix text update without creating
an undo entry. Snapshot creation is proportional to cell text/history; retained snapshots still
consume memory proportional to visited editing state. This is not constant-space history.

Real-browser checks used 100 code cells and navigation across ten viewport positions. After
settling, live CodeMirror counts were 16, 12, 11, 11, 12, 12, 14, 11, 12 and 12. Returning to an
evicted cell preserved actual typed text and Cmd-Z undo. Its outer height was 62.796875 px before
and after suspension. The check exposed and fixed two issues: navigation needed to scroll the
notebook ancestor, not only CodeMirror's internal viewport; a fixed 32 px placeholder minimum
changed compact-cell height, so measured height is now used exactly.

The grace period and asynchronous visibility delivery allow transient extra views (a busy-run
750 ms sample reached 42), so this is not a strict global capacity/LRU bound. Cell toolbars/models
and non-code cells remain mounted. Real OS IME and large multi-line scroll-anchor stress remain
unverified. The browser assertions and output are `/tmp/notebook-code-eviction-check.mjs` and
`/tmp/notebook-code-eviction-results.log`; they are temporary local artifacts, not CI coverage.

At the final implementation, 25 editor test files / 155 tests pass and production bundling succeeds.
Existing CSS/minification and large-chunk warnings remain. The isolated browser was stopped after
verification; the project development server remains running.

### Literal inline code in GFM tables

Five regressions initially demonstrated that pipe-containing inline code was split into columns
or changed on source preview/reload. Such code now uses an attribute-free HTML `code` pair with
HTML entities for table delimiters, backslashes and Markdown metacharacters. Simple table code
without pipes continues using ordinary backticks. A plain GFM parser test verifies that the
exported representation preserves code text without depending on the notebook parser.

The notebook inline tokenizer consumes a complete, single-line, attribute-free code pair and
treats its payload as literal text. Child HTML is escaped, entities remain text entities, and
math/Markdown are not recursively parsed. Attributed or unfinished code tags remain literal.
Tokenization uses the existing HTML boundary instead of searching the remaining input on each
text token, and stops at nested opening code tags to avoid repeatedly scanning malformed suffixes.
Security tests cover attributed tags, nested image markup and 2,000 unfinished opening tags.

This change does not add arbitrary raw-HTML support or solve merged/multi-paragraph table encoding.

The final related regression run passes 7 files / 83 tests, including table source/preview and
serialized-cell reload round trips, plain-GFM interoperability and literal-code safety cases.

### Rich table source fidelity (2026-09-19)

Tables that exceed GFM's single-paragraph, column-aligned model now serialize as standard HTML
tables. Ordinary tables retain GFM. The format decision inspects only table rows/cells; encoding
allocates output proportional to that table, not the notebook. Rich blocks serialize directly to
HTML, avoiding Markdown re-tokenization of every paragraph/list. This is a localized
improvement, not a proof of globally optimal parsing or constant-memory editing.

Complete HTML tables pass through DOMPurify with explicit tag/attribute allowlists. Event handlers,
styles, scripts, executable-cell identities and dangerous image/link schemes are not admitted.
Malformed percent-encoded node attributes are removed before extension parsing. General raw HTML
outside tables remains literal. A dedicated forward-only table boundary scanner handles nested
tables, quoted attributes, comments and HTML raw-text elements. Blank lines are accepted inside
hand-edited table source and code blocks. Missing outer closing tags remain literal rather than
being repaired by HTML parsing. The earlier generated-newline encoding workaround is removed.

Regression coverage includes source/preview/saved-cell reload with merged columns, consistent
column widths, independently aligned cells, multiple and empty paragraphs, nested lists, fenced
code with blank lines, and Mermaid. Parser tests cover formula/image attributes and hostile HTML.
The full editor run passed 25 files / 168 tests; a subsequent expanded targeted run passed 2 files /
40 tests. Production build passed with the existing CSS/chunk-size warnings. No new real-browser
rich-table interaction or end-to-end storage durability claim is made by these tests.

Remaining work includes exhaustive nested-structure/inline-whitespace fidelity, full-document source editing, broader cell
virtualization, and incremental/cross-tab persistence. The previous limitation about all merged
and multi-paragraph tables losing their structure is superseded by this bounded implementation.

#### Code-fence editing inside rich tables

A regression reproduced the caret following `<p` rather than the remaining backticks. The cause
was converting rich blocks through Markdown and back into HTML while computing the source edit.
Rich-table blocks now serialize their structure directly; code and Mermaid fences use a standard
`pre/code` source container annotated `data-type="fenced-code-source"`. Other HTML consumers show
its literal fenced text; the notebook renderer interprets a complete fence as code or Mermaid.
An incomplete fence stays literal. This notebook-specific annotation is necessary to distinguish
editable fenced syntax from ordinary literal preformatted HTML; it is not generic GFM syntax.

Both source projections retain the same container, so the existing common-prefix position mapping
locates the actual deleted backtick without a special offset patch. Regression tests cover direct
table-cell code and code nested in a list, caret position, undo/redo, saved-cell reload, repair and
preview. Complete-fence parsing reuses the notebook parser; incomplete payloads are escaped rather
than recursively interpreting arbitrary Markdown/HTML. DOMPurify is now a declared direct runtime
dependency, with the lockfile updated, instead of relying on an older transitive installation.

The table sanitizer uses its own DOMPurify instance because Mermaid registers hooks on the default
instance. A regression verifies that unrelated default-instance hooks cannot change table output.
Verification: 26 editor files / 179 tests passed before the isolation addition; the final focused
run (including isolation and both table-fence repair cases) passed 2 files / 42 tests. The production
build passed with existing warnings. The project-wide TypeScript gate still has baseline failures;
it is not reported as green.

Real-browser verification (isolated headless Chrome profile, development server on port 4173):
`/tmp/notebook-table-browser-check.mjs` seeds a table, positions the editor selection at the code
start, dispatches actual CDP Backspace key events, checks textarea focus and selection, inserts a
backtick through `Input.insertText`, and clicks Preview. Both direct table-cell code and a nested
list case pass, with caret offsets 60 and 81 respectively. This verifies the NodeView focus/input
path in addition to model tests, not real OS IME or cross-tab durability. The first attempt ended
when the page navigated during initialization; the same live browser target was rechecked before
rerunning, without restarting the server or browser.

The existing Mermaid browser suite was rerun with the new direct DOMPurify dependency: flowchart,
sequence and pie diagrams rendered with nonzero SVG dimensions in both light and dark themes;
source edits and invalid-source recovery passed. The dark-theme screenshot was inspected. Logs:
`/tmp/notebook-table-browser-check.log` and `/tmp/notebook-table-mermaid-regression.log`.

### Source command eligibility

The cell-source control now shares its eligibility predicate with the command: only a selected
Markdown cell in an editable editor enables it. Title, executable-code and already-source nodes
no longer expose a clickable no-op. Selection and editability subscriptions live in the button,
so this UI status does not force the notebook component to render for every selection move.
Subscriptions are released on unmount. A real-editor component test covers selection, read-only
changes, successful source entry, disabled state afterward and cleanup; the associated source
transition run passed 2 files / 36 tests. This does not claim full-notebook source mode is present.

### Raw/link and thinking presentation comparison

Raw and attachment/link cells have no metadata-derived node markup, so their presentation check
now ignores business metadata entirely. Tests use a throwing `toJSON` payload and a parser spy
to prove neither metadata serialization nor HTML reparsing occurs for metadata-only changes.
This comparison is constant work per raw/link cell; whole-document synchronization still walks
the cell list and is not claimed to be O(1).

Thinking cells now compare their actual node attributes: agent name, custom text, workflow mode
and text-array entries. Previously changes to those top-level fields could be missed because
only metadata was inspected. The text-array comparison is O(number of entries), with an identity
fast path and no JSON allocation. Removing fields restores the extension defaults, including
null custom text; a repeated sync after restoration does not parse the cell again.

### Image generation metadata ownership

ImageView already subscribes to its cell in the store for generation state, parameters, errors
and progress. Image node attributes do not parse those fields. Synchronization now retains image
nodes on metadata-only updates without traversing the metadata; the obsolete generation HTML
attributes and synthetic generation metadata in document projection are removed. Structural image
content still synchronizes normally. This also removes the generic metadata JSON comparison from
the document synchronizer: each supported type has an explicit presentation comparison.

Image HTML now escapes cell IDs, source URLs, alternate text and original Markdown independently.
A regression covers quoted attributes and a throwing generation-parameter serializer, proving the
parameters are not serialized into the document and quotes do not create event attributes.

### Synchronization allocation reduction

The synchronization pass builds ID maps without intermediate arrays of key/value tuples. It
creates a parsing DOM container only when a block actually needs parsing. Position calculations
no longer allocate prefix/range arrays; the selected block position comes from the resolved
selection, and structural selection restoration finds the target and accumulates its offset in
one pass. Replacement fragments are allocated only for structural replacements, not the common
single-cell text-diff path. A new regression asserts zero `createElement` calls on unchanged sync.
These changes reduce transient allocation; the maps/block arrays and O(cell count) pass remain.

### Current completion audit

| Requirement | Evidence / current boundary | Status |
| --- | --- | --- |
| Broken code-fence editing | Model tests cover ordinary/nested blocks, identity, undo and repair; Chrome covers direct/list-nested table code input and caret | Implemented for verified cases |
| Mermaid preview and source | Chrome covers flow/sequence/pie, themes, mixed hybrid content and quote/list nesting; broken-fence repair, lifecycle reuse and geometry tests | Implemented for verified cases |
| Cell source fidelity | Source transition tests include tables, code, metadata ownership and saved-cell reload; some inline whitespace / arbitrary custom table nodes remain unaudited | Partial |
| Full-notebook source | Boundary-comment projection, conflict checks, draft history and known-range commands; Chrome keyboard/320px checks; named-notebook draft/history retention across component remount and three repeated home/workspace navigation runs | Partial: refresh/crash recovery and OS IME/menu integration remain unverified or absent |
| Rendering time and space | Deferred/reclaimed CodeMirror views; cell lookup and projection reuse; broader node virtualization not implemented | Partial |
| Synchronization algorithms | Changed-block projection cache, structural-summary reuse for body edits, O(n log n) ordered-anchor matching on structural source apply; whole-document traversal remains O(n) | Partial |
| Storage durability and cost | Serialized writes, fail-closed empty-save protection, malformed/unavailable-content rejection, preflight serialization and weak text-size cache; full snapshots, cross-tab conflict and crash windows remain | Partial |
| Global verification | Editor/service tests and production build; repository TypeScript errors remain | Partial |

This audit does not establish completion of the user goal. Passing a focused test set is not a
substitute for broader source-fidelity, virtualization and persistence verification. Earlier entries
below record intermediate states chronologically; they do not override this updated source-UI status.

Integrated verification of the current accumulated changes passed 30 files / 198 tests across
the editor, auto-save service and IndexedDB provider. `npm run build` passed with existing CSS and
chunk-size warnings. Logs: `/tmp/notebook-integrated-final-tests.log` and
`/tmp/notebook-integrated-final-build.log`.

### Offscreen Mermaid reclamation

Ready diagrams now release both derived SVG strings and SVG DOM after 500ms outside the shared
observer's preload margin. A measured-height placeholder retains layout; a zero measurement from
a hidden parent does not overwrite the retained height. Returning to the viewport rerenders from
the caller-owned source. Short scroll reversals cancel reclamation and reuse the existing result.
Focused diagrams or diagrams containing selected text are retained to avoid disrupting interaction.
Pinned offscreen diagrams temporarily observe focusout/selectionchange and retry reclamation after
interaction ends, without requiring another visibility transition. Selection containment also
covers ranges whose endpoints lie outside the diagram. Listeners and timers are removed when
visibility/result changes or the component unmounts. This is not a strict global memory bound.
Error messages remain available rather than triggering
automatic retry loops. Unit coverage includes eviction, height retention, rerendering and focus
pinning. An isolated Chrome run seeded 24 flowcharts, rendered the first, scrolled to the last,
waited until the first SVG was removed, then scrolled back and verified its label and restored SVG.
The first block measured 213.1875px before suspension, during its placeholder and after restoration.
This is one verified layout, not an exhaustive diagram-size or hard memory-bound claim. Script:
`/tmp/mermaid-eviction-browser.mjs`; evidence: `/tmp/mermaid-eviction-browser.log`.

### Markdown export source fidelity

Export uses cell data rather than mounted preview DOM, so SVG reclamation does not remove Mermaid
source from Markdown exports. The exporter now uses the canonical Cell/OutputItem types and shared
fence serializer: hybrid code is included, actual languages are retained (Python remains the
default), and fences grow around embedded delimiter lines in both code and textual outputs.
Raw cells are exported as literal text fences; image/link source and available thinking-cell text
are retained instead of silently becoming empty sections. Cell counts are collected during the
same pass that serializes sections. Export remains O(total exported content) in time and space.

Pure conversion tests cover all cell types, Mermaid source and embedded fence delimiters. This
does not make Markdown a lossless notebook-storage format or establish rendered Mermaid support
in PDF/DOCX. Full metadata still belongs to notebook JSON, and document-source format remains an
open product choice.

### Streaming fence scans

Fence segmentation now has a generator shared by the array-returning public scanner, the notebook
parser and standalone-fence detection. Standalone detection retains at most its candidate fence
instead of materializing both a segment array and a filtered fence array. Fence formatting scans
candidate delimiter lines directly rather than splitting every code line into an array. Time is
still linear in the input; output strings and matched delimiter strings still require memory.
Tests cover consecutive candidate lines with LF/CRLF/CR and a 100,000-line payload, alongside the
existing editor source-transition and Markdown-export regressions.

Mixed-newline regression tests exposed four failures: removing the closing separator by the
opener's newline left either a stray CR or an unwanted newline. Extraction now examines the
actual separator immediately before the closer, independently of the opener, while preserving
the original full source. Formatting uses a CR closing separator when the payload itself ends
in CR, avoiding accidental combination of payload CR and inserted LF. Tests cover all mixed
opening/closing newline cases and terminal CR/LF/CRLF/blank-line payloads.

### Store no-op updates

`updateCell` now checks the shared immutable-snapshot cell index before creating an Immer draft.
Missing IDs and unchanged normalized content return without publishing a new state, rebuilding
tasks or assigning phases. Once the snapshot index exists, lookup is O(1); first construction is
still O(n). Per-keystroke console logging was removed. Actual edits still rebuild tasks because
their content lists currently hold cell objects; skipping that rebuild would leave stale text.
Tests assert whole-state identity for no-ops and updated task content for a real code edit.

### Non-Markdown content updates

The preceding full-task rebuild limitation is now narrowed to Markdown edits. `updateCell` for
non-Markdown cells refreshes matching references in phase intros and step content within the Immer
draft, preserving hierarchy, ranges, phase IDs and running/completed statuses. It does not tokenize
Markdown or reassign phases. This remains O(task content references), plus immutable cell-array
update costs, rather than an O(1) claim; the cost no longer depends on all Markdown text length.

Task parsing now removes its construction-only `introPhase` and `currentIntroStep` cursors before
publishing the canonical task model. No other source consumer referenced these cursors; retaining
them created duplicate object paths and complicated reference updates. Store regressions verify
zero parser calls during code edits, up-to-date task content and unchanged task statuses. The store
test run passed 3 files / 5 tests.

### Consolidated verification and proposed commit groups

The current editor/store/export/auto-save/IndexedDB selection passes 35 files / 221 tests;
the production build passes with existing warnings. TypeScript reports 314 repository errors,
with no diagnostics for the newly added table codec, fence utility, source button, Markdown
exporter or task-reference helper. Logs: `/tmp/notebook-current-suite.log`,
`/tmp/notebook-current-build.log`, `/tmp/notebook-current-tsc.log`.

Proposed reviewable commit groups (not yet committed):

1. Source fidelity: rich-table codec, sanitizer dependency, fence scanning/newlines, source control.
2. Synchronization/store: presentation ownership, allocation reduction, no-op updates and task refs.
3. Diagram lifecycle: offscreen SVG reclamation and its tests/browser evidence.
4. Markdown export: all cell kinds, languages and shared fence serialization; depends on group 1.

Any commits must use Silan.Hu <silan.hu@u.nus.edu> for author and committer. These verification
results do not close the previously recorded full-notebook-source, broader virtualization or
persistence architecture gaps.

### Task hierarchy block semantics and reference growth

Three new regressions reproduced incorrect hierarchy from fenced examples, duplicate cell
references proportional to Markdown line count, and missing Setext headings. Task derivation now
uses Marked's top-level block tokens instead of three heading regexes on every physical line.
Nested quote/list/code headings do not become notebook tasks; a cell is appended at most once to
each owning step, even when it contains many paragraphs or lines. CR/CRLF are normalized for block
lexing. Only block tokenization runs: inline marks/links are irrelevant to hierarchy and are not
parsed. A spy test checks that inline tokenization is not invoked.

The initial block-parser change passed the editor-model/store/parser selection (9 files / 81
tests). The block-only optimization is separately checked with parser/store tests. Custom notebook
HTML-table source constructs and multiple structural headings within one cell still need broader
hierarchy integration coverage; this does not claim full semantic equivalence for every extension.

The HTML-table boundary tokenizer is now a pure shared utility under `utils/markdown`, used by
both task block lexing and editor preview. Its previous editor-local implementation is removed.
Task parsing therefore keeps nested/blank-line-rich table source opaque, including heading-like
code examples, and treats an unfinished table as literal source rather than creating phantom
tasks. New integration tests cover both cases. Multiple structural headings within one cell and
other custom extensions remain separate coverage gaps.

### Incremental Markdown structure lexing

`MarkdownStructureIndex` caches compact heading/content summaries by cell ID and exact source.
Unchanged source reuses its summary even when store publication creates new cell objects. Only
changed Markdown is block-tokenized. Consecutive non-heading blocks collapse to one content marker;
full token trees are not cached. Each projection replaces the cache with entries for the current
document, removing deleted/not-current cells rather than accumulating historical sources.

A 1,000-cell regression verifies exactly one block-tokenizer call after one Markdown cell changes.
Separate tests cover cloned-cell reuse and removal/reintroduction. The task model is still rebuilt
by walking current summaries, and projection still allocates an O(cell count) map/array; this is
incremental text parsing, not full O(1) task updates or globally minimal memory usage.

### Progress ownership across structural edits

Task re-derivation during `setCells`, content edits, insertion/deletion and type conversion now
preserves phase status/icons and step status for matching IDs. Derived titles, ranges and content
remain newly parsed; new IDs retain default progress. A shared reconciliation function handles
all these editing paths. Explicit run-all reinitialization and load/create initialization do not
use this reconciliation and retain their existing reset semantics.

Regression tests cover ordinary Markdown edits, source-mode publication, new steps and changed
derived ranges without mutating prior task objects. The store/parser selection passed 5 files /
13 tests. This addresses progress resets from editing, not stable IDs for renamed/reordered steps.

Insertion and movement now use the same `deriveEditedTasks` entry point as cell publication,
deletion, Markdown updates and type conversion. The old insertion heuristic (`includes('#')`)
missed ordinary-cell index shifts and Setext headings; movement did not refresh task ranges at all.
Tests verify raw-cell insertion shifts later step indices, moving it across a phase boundary updates
ownership/content, and inserting a Setext heading creates a phase. Structural assembly still runs
after order changes, while unchanged Markdown summaries are reused. The combined store/parser
selection passed 7 files / 20 tests.

### Clearing removed phase ownership

Phase assignment now computes final values before applying them, clearing stale IDs on cells no
longer covered by any task (including removal of the last heading). Only changed values are written,
avoiding needless Immer invalidation from a clear-then-reassign pass. Integer ranges are clipped to
the document, so a negative imported start cannot cause a huge out-of-document iteration. Tests
cover stale-phase removal, unchanged setter avoidance and oversized ranges; parser/store regressions
pass 5 files / 15 tests. The assignment buffer is O(cell count); overlapping ranges can still incur
repeated fills, so this is not a general optimal interval-assignment claim.

The repeated-fill limitation above is now addressed by `resolvePhaseOwnership`. It visits ranges
in reverse precedence and uses a union-by-rank/path-compressed successor index to skip cells already
assigned by a later range. Every covered cell is assigned once. For n cells and r ranges the
resolver uses O(n) auxiliary space and amortized O((n+r) alpha(n)) work, rather than O(n*r) repeated
fills in the fully overlapping case (plus traversal of task/phase containers). The typed successor
arrays add approximately 9 bytes per cell, alongside the assignment array; this is an explicit
memory-for-worst-case-time tradeoff, not a claim of globally minimal memory.

Randomized deterministic tests compare against the old last-writer semantics, including reversed
and clipped ranges. A 10,000-range / 10,000-cell fully overlapping fixture verifies precedence.
Combined parser/store/structure tests pass 7 files / 19 tests.

### Integrated verification and title publication

The cumulative editor/store/Markdown/export/autosave/persistence selection passed 39 files /
236 tests (`/tmp/notebook-structure-integrated.log`), and the production build passed
(`/tmp/notebook-structure-build.log`). Type checking still reports 314 errors across the repository;
the checked notebook store and new structure/ownership/progress modules have no diagnostics in
that run. This is not a clean global type-check claim.

A subsequent title-action fix routes renamed and newly created titles through the same derived
task builder as other structural edits and publishes `notebookTitle` in the same transaction.
Repeated identical title updates preserve state identity. The focused store suite passes 6 tests
(`/tmp/notebook-title-coherence.log`); the integrated/build results above precede this small fix.
All changes remain uncommitted.

### Fence-break target ownership

Executable fence breaking now verifies cell identity and executable cell type before either
refreshing attributes or replacing a node. A stale callback pointing at another executable cell
is rejected without dispatching a transaction. The source-transition suite passes 36 tests
(`/tmp/notebook-source-ownership.log`), including the new mismatch/no-mutation regression and
the existing fence repair, nested table, Mermaid, undo and reload cases. This proves the command
boundary, not that a stale callback has been reproduced in the browser.

### Direct executable-cell source entry

Code/hybrid NodeViews now expose a Source button. It resolves the current cell content at click
time and enters intact fenced source, with the caret at the first body character. Direct source
entry and fence deletion share one transition implementation, including ownership checks,
store-backed undo capture and original code/hybrid type. This is cell-local source mode, not
the still-missing full-document source editor.

The transition suite passes 38 tests (`/tmp/notebook-code-source.log`). New code/hybrid cases
verify latest content rather than stale node attributes, longer delimiters for embedded fences,
caret placement, undo/redo and preview reconciliation retaining outputs and identity. The new
button's visual placement and actual browser interaction have not yet been verified.

Browser interaction is now verified in an isolated headless Chrome profile:
`/tmp/notebook-direct-source-browser.mjs` and `/tmp/notebook-direct-source-browser.log`.
For both code and hybrid cells it clicks the actual Source button, verifies focused textarea
and body-start caret, inserts text through CDP input, clicks Preview, checks editor identity/type
and the active application store's content and retained outputs, then reopens source and checks
the edited text. Both cases pass. Store inspection must import the exact loaded Vite module URL
(including its timestamp); importing a different URL creates a separate store instance and is
not authoritative application-state evidence. No visual screenshot review was performed here.

### Shared source undo handling

Mermaid and Markdown source textareas now share `handleSourceInputHistory`, routing undo/redo
to the document history that owns their attribute edits. Previously Mermaid only stopped event
propagation, leaving native textarea history disconnected from the document's history. The helper
supports Ctrl/Cmd+Z, shifted Z and Ctrl+Y, excludes Alt combinations and composition/keyCode 229,
and avoids commands for read-only documents. Keyboard routing tests cover these cases; this does
not constitute real OS IME verification or proof of composition/preview-switch behavior.

### Imported source attribute decoding

Source, nested fenced-code and Mermaid attributes now use one text-attribute decoder, also used
by executable-code attributes. Invalid URI escapes remain literal rather than throwing during
ProseMirror HTML parsing. Tests import `%`, `%E0%A4%A` and `%ZZ` into all three source-bearing
node types and verify original text survives another HTML serialization/load cycle. The source
transition and code-attribute suites pass 44 tests (`/tmp/notebook-source-decoding.log`). This
protects malformed imported text; it is not a substitute for HTML sanitization.

### Shared positional cell index

The immutable-snapshot WeakMap now stores ID-to-position maps, shared by object and position
lookups. `updateCell` reuses the located position instead of repeating `findIndex` inside Immer.
Index construction uses a direct loop, removing the temporary outer array and one tuple per cell.
First lookup per snapshot remains O(n) time/O(n) retained index space; subsequent lookups are
expected O(1). This does not remove the costs of publishing a new array, derived tasks or Immer.
The focused index/store suite passes 7 tests (`/tmp/notebook-position-index.log`), covering index
reuse, immutable replacement/reordering, missing IDs and no-op store identity.

### Executable-to-diagram lifecycle verification

A new real-editor regression enters executable source, changes its language/body to Mermaid,
previews a diagram, undoes/redoes preview and reloads serialized cells. Cell identity, diagram
source, prior outputs and business metadata survive; preview clears source-mode metadata.
The transition suite passes 42 tests (`/tmp/notebook-code-diagram-transition.log`). Mermaid's
React control suite also now sends keyboard events through its actual textarea to verify document
undo/redo routing and composition exclusion: 3 tests pass
(`/tmp/notebook-mermaid-history-controls.log`). These are automated editor/DOM regressions, not
new real-browser or real-OS-IME verification.

### No-op publication and reconciliation allocation

`reconcileCells` reuses the shared immutable-snapshot cell index instead of building another
map plus temporary tuples on every document update. Initialized `setCells` calls with a nonempty
identical cell sequence now return before normalization, task derivation or publication. The
same-array case is O(1); a fresh array containing the same references/order needs O(n) comparison
but no per-cell copies or derived task tree. Changed objects and empty-input title initialization
retain the regular path. A regression asserts full state identity and zero parser calls for both
no-op forms, followed by a real content update. Combined source/store/index/reconciliation tests
pass 54 tests (`/tmp/notebook-publication-noop.log`).

### Canonical task cell references at publication

After phase derivation and unchanged-cell identity reuse, `setCells` now binds task intro/step
references to the final published cells. Previously tasks retained temporary normalization
copies even where the main cell array reused existing objects. A shared traversal serves both
single-cell replacement and publication binding, with shared-index lookup rather than repeated
linear searches. Binding costs O(n+r) on a cold index (n cells, r task references), O(r) once indexed;
it removes retained duplicate cell objects, not the transient normalization copies themselves.
The identity regression checks every task reference against its published cell. Store/parser
tests pass 15 tests (`/tmp/notebook-task-reference-binding.log`).

### Copy-on-write cell normalization

`setCells` now retains already published cells during normalization and computes phase ownership
without mutating them. Only new/changed inputs are normalized; ownership changes allocate a cell
copy. This replaces the previous clone-every-cell-then-discard-unchanged-copies pass. Final task
references still bind to the publication. Array/index/ownership/task processing remains linear
or as documented above; new cell objects scale with changed inputs and changed ownership rather
than every cell. No whole-update O(1) claim is made.

Source/store/parser regressions pass 57 tests (`/tmp/notebook-copy-on-write.log`). A subsequently
added frozen-snapshot reorder test verifies changed ownership is copied, old ownership is intact,
and unaffected cell/output references survive; the updated identity suite passes 8 tests
(`/tmp/notebook-cow-identity.log`).

### Cumulative verification after copy-on-write migration

The combined Editor/store/Markdown/export/autosave/persistence selection passes 40 files /
256 tests (`/tmp/notebook-cumulative-latest.log`). Production build passes in 58.89 seconds
(`/tmp/notebook-cumulative-build.log`), retaining the existing large-chunk warnings. Type checking
still fails with 314 diagnostics (`/tmp/notebook-cumulative-types.log`); no diagnostics match the
changed source-history/encoding/transitions, cell-index, task-reference, notebook-store,
structure-index or phase-ownership modules. A passing production build is not a clean type check.
This verifies the accumulated changes together, not completion of full-document source mode,
all-cell virtualization or storage-conflict handling. Changes remain uncommitted.

### Mermaid source view continuity

Switching a Mermaid block to Preview captures its source textarea selection (including direction)
and scroll offsets. Returning to Source focuses the input without scrolling the page and restores
those view coordinates. This is constant-size local UI state, not another copy of source text or
a document update. It survives preview/source toggles within the mounted block, not whole-node
replacement/reload. The Mermaid control suite passes 4 tests, including focus/selection/scroll
restoration and zero attribute writes (`/tmp/notebook-mermaid-source-position.log`). Scroll behavior
was asserted in the DOM test environment; real-browser layout verification is still outstanding.

### Source indentation commands

Markdown and Mermaid source textareas accept Ctrl/Cmd+] and Ctrl/Cmd+[ for two-space indent and
outdent (also removing one leading tab). Selected lines are transformed together; a selection
ending at the next line's start excludes that line. Caret/selection coordinates are remapped and
selection direction is retained after the controlled input updates. Plain Tab retains normal
keyboard focus navigation. Composition, read-only and Alt guards apply before these commands.
The transform processes selected lines; producing the resulting immutable string still costs
O(total source length). Actual browser keyboard/selection behavior remains to be verified.

Indentation no longer queues a requestAnimationFrame selection write. It updates native textarea
text and mapped selection synchronously before publishing the controlled document value, avoiding
an obsolete callback overwriting a later interaction. A controlled React input regression exercises
consecutive indent/outdent, backward selection and no publication on Tab. Source keyboard/selection
tests pass 15 tests (`/tmp/notebook-source-sync-selection.log`). Browser verification remains open.

Browser verification now passes for Ctrl+] / Ctrl+[ via CDP keyboard events: controlled textarea
text, backward selection and ProseMirror source attributes all agree after consecutive commands.
An 80-line Mermaid source also restores backward selection 20–50, scrollTop 200px and focus after
Preview/Source switching. Evidence: `/tmp/notebook-source-keyboard-browser.mjs` and
`/tmp/notebook-source-keyboard-browser.log`, run in isolated headless Chrome. This covers Ctrl
events on the host browser, not a separate physical macOS Cmd-key or OS IME test.

### Independent indentation undo boundaries

Source indentation now closes the document history group before and after its attribute edit,
so adjacent typing cannot merge into the same undo operation. A real-editor regression types,
indents, types again and checks three undos recover those three states independently. The source
transition/controlled-input suites pass 44 tests (`/tmp/notebook-indent-history-boundary.log`).
The history-boundary addition follows the browser run above and has not yet been browser-retested.

The browser keyboard scenario has now been rerun after that addition, extended with two actual
Ctrl+Z key sequences after indent/outdent. Each undo restores exactly one indentation operation;
the textarea retains focus. Selection mapping and Mermaid source-view restoration still pass.
Evidence: `/tmp/notebook-source-history-browser.log`, using the extended
`/tmp/notebook-source-keyboard-browser.mjs` in isolated Chrome.

### Cell projection attribute fidelity

HTML projection now escapes imported IDs in code/hybrid, source, Markdown, title, thinking,
attachment and raw cells, plus title cover/icon, language, agent name and attachment Markdown.
These values previously could terminate a quoted HTML attribute. Regression fixtures with quotes,
ampersands and angle brackets assert exact attribute values and absence of injected attributes.
Projection/image/source-transition suites pass 52 tests (`/tmp/notebook-projection-attributes.log`).
This covers attribute encoding, not a complete audit of URL policies or all import security.

### Output reuse during source edits

Normalization now reuses a cell's already published outputs when a new cell object changes its
content/type/source metadata but retains the same output reference. Previously every such edit
mapped and copied all output items. Replacement outputs still use normal serialization. The
identity suite passes 9 tests (`/tmp/notebook-output-reuse.log`), including a source transition
that asserts output identity and zero calls to the output array's map, followed by replacement
output publication. This removes output-count-proportional normalization work from that path;
it does not eliminate full-snapshot persistence or other whole-document processing.

### Full-document source codec foundation (not yet exposed in UI)

`NotebookSourceDocument` projects cell bodies into a single editable buffer with per-session
boundary comments. Executable cells use collision-safe fenced code; outputs and business metadata
remain in the captured cell model. Unchanged sections reuse cell objects, edited executable
sections preserve code/hybrid identity, and broken fences become literal source cells. Parsing
rejects unknown, duplicate, mismatched or incomplete boundaries before returning a document.
Complete sections can be removed. Five codec tests pass (`/tmp/notebook-document-source-codec.log`).

This is a foundation, not a delivered full-document source UI: concurrent document updates,
new-cell insertion, lifecycle/apply/cancel behavior and editor integration remain to be implemented.
Do not apply its captured snapshot over live updates without reconciliation/conflict detection.

The codec now exposes three-way `reconcile(source, current)`: untouched source retains the live
document, edits merge with current outputs/business metadata and changes to untouched cells, while
conflicting text or external structural changes throw before publication. Deletion of an externally
changed cell is also rejected. Duplicate initial IDs are rejected. Nine codec tests pass
(`/tmp/notebook-document-source-conflicts.log`). Integration must use this reconciliation rather
than publishing `decode` results directly; the UI/lifecycle/insertion work is still outstanding.

`NotebookSourceSession` now owns the draft and explicit editing/conflicted/applied/cancelled
states. Apply checks notebook identity, reconciles against live cells and suppresses no-op writes.
Conflicts retain the draft for correction; cancellation does not publish and terminal sessions
reject reuse. The supplied publisher must be synchronous and atomic; the session cannot roll back
partial side effects of a publisher that mutates and then throws. Session/codec suites pass 13
tests (`/tmp/notebook-source-session.log`). UI integration, new cell creation, and whole-document
apply/undo ownership remain unimplemented and must precede exposing this as complete source mode.

Source sessions now support appending registered Markdown, Python code and raw cell sections.
IDs are allocated once per insertion, stay stable across decode/reconcile attempts, and never
mutate the captured notebook. Cancel discards the local additions; only successful apply publishes
them. Unknown manually invented boundary IDs still fail validation. Codec/session suites pass
15 tests (`/tmp/notebook-source-insertion.log`). This completes the initial insertion data path,
not its UI, insertion-at-caret interaction or whole-document undo integration.

The full-document text projection now uses textarea-compatible LF newlines while unchanged
sections still return original cells, preserving their original CRLF/CR payloads byte-for-byte.
CRLF-pasted boundaries are accepted too. Only genuinely edited sections take normalized content.
Codec/session tests pass 18 tests (`/tmp/notebook-source-newlines.log`), including DOM textarea
round trips, unchanged code alongside edited prose, and no publication for newline-only input
normalization. UI and whole-document undo integration remain outstanding.

### Whole-source application history foundation

`applyNotebookSource` now replaces the document in a closed history group and records changed-cell
snapshots in an ID-addressed `NotebookSourceStep`. The editor update bridge consumes these steps
on apply, undo and redo, overriding store-owned source fields while retaining latest outputs on
surviving cells. Deleted cells can recover their captured data on undo. The snapshots retain only
changed/added/deleted cells, not a second copy of every unchanged cell.

The real-editor test applies a code edit plus deletion, updates the live output, then verifies undo
and redo restore source/structure without reverting that output. Combined source/history/reconcile
tests pass 48 tests (`/tmp/notebook-source-history-integrated.log`). Type checking still reports
314 errors, with none in the new source document/session/step/application modules or update bridge
(`/tmp/notebook-source-history-types.log`). UI integration and broader history scenarios remain;
this is not yet a delivered full-document source feature.

### Full-document source UI connected

The editor toolbar now exposes Notebook source. A native modal dialog owns a local source session,
offers Markdown/Python/raw append controls, and applies via three-way reconciliation plus the
undoable source transaction. Cancel and Escape discard the draft; conflicts remain visible without
closing the dialog. Boundary comments and output separation are explained in the UI.

Two React/real-editor integration tests pass (`/tmp/notebook-source-dialog.log`): edit plus insertion
and document undo, and conflicting live text followed by cancellation. The modal API is simulated
in DOM tests; actual browser focus trapping, layout, interaction and history are not yet verified.
Codec/session/application tests also pass 19 tests (`/tmp/notebook-source-ui-foundation.log`).
This is the first connected implementation, not a completion claim for the broader editor goal.

### Full-source browser verification and non-content history fixes

The browser run uncovered two history pollution paths absent from the initial isolated editor
fixture: automatic trailing-paragraph insertion and BaseNodeView focus/FSM attribute updates.
Both now opt out of undo history; FSM-only changes also suppress content-update publication.
The application-history regression now includes the production trailing-paragraph plugin.

The modal explicitly focuses its textarea after showModal and restores focus to its trigger on
close. Isolated Chrome now passes actual text input, Python-cell insertion, Apply, Cmd+Z undo,
Escape cancellation and trigger focus restoration (`/tmp/notebook-whole-source-browser.mjs`,
`/tmp/notebook-whole-source-browser.log`). Existing outputs remain intact. Initial failed runs
exposed the focus/history issues above; the final run passes, with focusAfterCancel BUTTON.

Editor/store regression passes 40 files / 267 tests (`/tmp/notebook-source-ui-regression.log`).
Type checking still reports 314 diagnostics, with none in the new source UI/history or changed
BaseNodeView module (`/tmp/notebook-source-ui-types.log`). The last trigger-focus refinement
followed that cumulative run and was browser-verified separately. Full goal completion remains
unproven; visual layout across viewport sizes and more history/lifecycle cases remain open.

### Runtime data across undo removal

Source history inverse steps now share retained live data for affected cells. Before an undo/redo
removes a cell, its latest outputs and business fields are captured so a later restoration does
not revert to the original source-apply snapshot. Source fields still follow the historical target.
Explicitly cleared outputs remain cleared on another undo/redo cycle. Only affected identities
are retained, and ordinary transactions bypass the capture path. Application/dialog regressions
pass 4 tests (`/tmp/notebook-source-history-runtime.log`), including add/run/undo/redo, description
and execution metadata retention, followed by clearing outputs and repeating the cycle.

### Incremental full-source application

External synchronization and source application now share `projectDocumentBlocks`. Source apply
uses its captured/current cell baseline and forces projection only for changed cells; unchanged
nodes are reused. Shared prefix/suffix range detection accepts an explicit equality predicate so
source-owned executable changes are compared fully, while external store sync retains its original
store-owned behavior. Apply replaces only the changed middle range instead of the entire document.

Sync/application/dialog regressions pass 30 tests (`/tmp/notebook-source-incremental.log`). A new
1000-cell test asserts exactly one parseSlice for a single raw-cell edit, unchanged neighboring
node identity and successful undo; the updated application suite passes 3 tests
(`/tmp/notebook-source-incremental-scale.log`). Indexing/range scans remain O(n); parsing is limited
to changed cell content. Widely separated changes still replace their enclosing middle range.

For unchanged cell order/count, source application now groups adjacent changed blocks and replaces
each run independently, right-to-left. Position calculation walks the original blocks once rather
than rescanning a prefix for each run. Structural insert/delete/reorder still uses the enclosing
range algorithm. Large-document tests now cover two separated edits, asserting two parses and two
replacement steps, unchanged neighbor identity and one undo restoring the document. This removes
unnecessary middle-range replacement for sparse content edits without introducing an LCS matrix.

Structural source edits now use stable-ID/equal-node LIS anchors as well. Unique identified blocks
retain a maximum-length ordered subsequence; gaps become right-to-left replacement operations.
Planning costs O(n log n) time/O(n) space rather than quadratic LCS storage. This optimizes retained
equal identified blocks, not all DOM work or anonymous-node matching. Duplicate identified blocks
are rejected instead of choosing ambiguous anchors.

One hundred deterministic randomized cases compare retained-block count against exact small LCS
and reconstruct the target sequence from the planned ranges. Moving one block across 10000 others
produces two ranges removing only one old block. Planner/application/dialog suites pass 8 tests
(`/tmp/notebook-source-lis.log`). Real-browser reordering verification remains outstanding.

Browser reordering now passes using the extended `/tmp/notebook-whole-source-browser.mjs`:
move a complete raw-cell section ahead of a code cell, apply, verify exact order, Cmd+Z to restore
the original order and Cmd+Shift+Z to redo. The code output survives both transitions. The same
run also passes edit/insertion/apply/cancel/focus scenarios after incremental/LIS integration.
Evidence: `/tmp/notebook-source-reorder-browser.log`, isolated headless Chrome. This verifies the
specified reorder workflow, not every structural permutation or large-document DOM performance.

### Browser scale observation

An isolated Chrome run seeded 1000 raw cells, opened whole-document source, changed one cell via
browser text input and clicked Apply. All 999 other raw-cell wrapper DOM elements retained identity,
the edited store content was correct, total count remained 1000 and the dialog closed. The measured
interval from clicking Apply through two animation frames was 117.4 ms in this single run
(`/tmp/notebook-source-scale-browser.mjs`, `/tmp/notebook-source-scale-browser.log`). This is not
a statistically stable benchmark, comparison against baseline, memory measurement or proof for
mixed/complex cell types; it demonstrates DOM reuse for this concrete workload and leaves meaningful
whole-document latency to investigate.

The projection cache was inspected before adding another cache. A new 1000-Markdown-cell regression
confirms one text transaction calls toJSON only for the changed wrapper, paragraph and text (three
calls), preserves every other projected cell reference, and performs zero serialization on repeat
reads of the same document. It passes (`/tmp/notebook-projection-cache-scale.log`). Therefore full
re-serialization of unchanged wrapped cells is not supported as the remaining bottleneck by this
evidence; further performance work should measure publication/derived tasks/render scheduling rather
than duplicate this existing cache.

### Non-structural publication reuse

`setCells` now recognizes stable cell identity/order/type with unchanged Markdown content. For
these publications it retains phase ownership and updates task cell references with Immer rather
than reparsing headings, rebuilding every task or allocating the phase-assignment structures.
Reference binding compares Immer draft originals to avoid writing unchanged cell references and
cloning unaffected branches. This remains O(n+r) comparison/reference traversal, not constant-time
publication, but allocation follows affected branches rather than the whole hierarchy.

Store/progress regressions pass 11 tests (`/tmp/notebook-task-branch-reuse.log`), including zero
Markdown parse calls for a code-content publication, unchanged neighboring phase identity, updated
canonical references and preserved old snapshots. The preceding store/dialog run also passed
11 tests (`/tmp/notebook-nonstructural-publication.log`).

Three subsequent browser runs of the same 1000-raw-cell source-edit workload measured 99.3,
71.7 and 72.7 ms from Apply through two animation frames (median 72.7 ms). Every run retained all
999 unedited wrapper DOM elements and correct cell count/content. Logs:
`/tmp/notebook-source-scale-after-1.log`, `-2.log`, `-3.log`. These observations are lower than the
earlier single 117.4 ms run, but warmup/scheduling and the lack of interleaved baseline trials prevent
assigning the full difference to this optimization. This remains local diagnostic evidence rather
than a general performance guarantee.

### Markdown body publication without hierarchy reconstruction

The stable-structure publication path now also handles Markdown body edits. The shared
`MarkdownStructureIndex` compares ordered heading/content summaries, including heading depth and
text, rather than scanning for `#`. It checks cell identity/order/type first and retains only the
latest document's summaries. Changed Markdown is lexed once; a subsequent hierarchy rebuild reuses
that result. Empty-to-content transitions and content movement across headings remain structural.
Unchanged structure preserves phase ownership and unaffected task branches while rebinding edited
cell references. This is still O(n + r + changed Markdown parsing) work with O(n) temporary projection
space, not constant-time publication or a claim of globally optimal editor complexity.

Focused structure/parser/store validation passes 30 tests in 4 files
(`/tmp/notebook-structure-summary.log`). Tests cover body edits, heading rename/addition, fenced
heading-like text, content boundaries, canonical cell references and unaffected phase identity.

Final broader validation for this checkpoint: 46 test files / 296 tests pass with `--maxWorkers=2`
(`/tmp/notebook-final-editor-regression-limited.log`); production build passes
(`/tmp/notebook-final-editor-build.log`). The initial unrestricted run, concurrent with build and
type checking, passed 294 tests but timed out two 1000-cell tests at the default 5-second limit.
Both pass without changing assertions or timeouts in the limited-concurrency rerun. Global type
checking still reports 314 errors (`/tmp/notebook-final-editor-types.log`), with no diagnostics in
the structure-index, Markdown-parser or notebook-store modules changed at this checkpoint.
Existing large-bundle/CSS/browser-data warnings remain; this is not a clean global type-check claim.

The direct `updateCell` path now uses the same structural-summary comparison as `setCells` for
Markdown edits. Non-structural content changes rebind canonical references without rebuilding the
hierarchy; heading edits still recalculate ranges and ownership. No parallel parser or secondary
cache was introduced. Validation: 32 tests / 4 files pass
(`/tmp/notebook-direct-update-structure.log`), including a body → heading → renamed heading → body
sequence, downstream ownership changes, preserved progress and exact canonical-reference identity.
This path retains linear summary/reference traversal; the optimization removes unnecessary hierarchy
construction, not all document-size-dependent work.

### Source insertion focus

Appending a cell in the whole-document source dialog now returns its editable-body position from
the source codec through the session, avoiding boundary-marker parsing in the UI. After the controlled
textarea value commits, a layout effect restores focus and collapses selection inside the new body
(inside the fence for Python), then scrolls the textarea to the appended section. Source insertion
normalizes pasted CRLF before calculating DOM selection offsets. Add buttons wrap on narrow widths.
Codec/session/dialog regressions pass 23 tests in 3 files
(`/tmp/notebook-source-insertion-focus.log`), including typing at the returned caret and successfully
applying Markdown, Python and raw cells. Real-browser narrow-width layout and scrolling have not yet
been verified for this change; jsdom tests establish focus, selection and content correctness only.

Follow-up real Chromium verification now passes at 1280×720 and 320×720 using a 51-cell source
document (`/tmp/notebook-source-layout-browser.mjs`, log of the same basename). The dialog stays
inside the viewport with no horizontal overflow; every action button stays inside its horizontal
bounds. After Add Python, textarea scrollTop equals its maximum (2759 / 4439 px respectively),
focus/selection is inside the new Python fence, CDP keyboard text insertion followed by Apply stores
`print(42)` as executable code content. Initial browser navigation invalidated the first diagnostic
evaluation (`Promise was collected`); the rerun on the loaded page passed. This closes the preceding
focus/scroll/narrow-width verification gap, but does not constitute a general mobile interaction audit.

### Raw-cell external synchronization and history

Raw NodeViews previously mirrored store content through ordinary `updateAttributes`, recording a
background synchronization as a user edit. External content now uses a transaction marked
`addToHistory: false` and `EXTERNAL_CELL_SYNC`, with current node type/identity checks. Explicit raw
editing still uses its normal save transaction. A real ProseMirror history-state test confirms the
external content is applied with zero undo depth and no store update callback; source-application
regressions also pass (8 tests / 2 files, `/tmp/notebook-raw-history.log`). This check covers external
sync history pollution, not every interleaving of raw-cell drafts and concurrent source sessions.

Raw local editing now retains an explicit draft (base text, current value, conflict error) rather
than independent editing/content flags. A changed draft cannot overwrite changed external content:
blur/save keeps the draft open and reports the conflict, with Escape discarding the draft to show
current content. Untouched drafts and drafts already equal to live text close without writing. Focus
is applied by the editing lifecycle effect instead of an uncancelled timer. Validation passes 10 tests
in 2 files (`/tmp/notebook-raw-conflict.log`): conflict retention/discard, untouched concurrent updates,
normal Ctrl+Enter save, no-op blur, read-only behavior, external history isolation and source apply.

### Mermaid failure recovery audit

Additional regression coverage verifies that editing invalid Mermaid source automatically clears
the previous error and renders corrected input, without requiring Retry. A superseded pending
render may reject after source changes; its error is discarded and the queued current source still
renders. Existing cancellation/serialization logic passes both cases without a production-code
change. Preview, render-service and Mermaid node tests pass 14 tests / 3 files
(`/tmp/notebook-mermaid-recovery.log`). These tests use a mocked renderer to deterministically control
completion order; they verify lifecycle behavior rather than every Mermaid diagram grammar.

### Source sessions across access changes

The notebook toolbar no longer unmounts the whole source-session component when read-only access
changes. It hides the source trigger instead, preserving an already-open draft for copying or
cancellation. Apply checks both the access context and editor editability; the session also checks
the current notebook ID. Tests verify retained drafts on access change, rejection without store/doc
mutation after switching notebooks, and retry after editor editability returns. Dialog/session tests
pass 14 tests / 2 files (`/tmp/notebook-source-access-final.log`). Navigating away and unmounting the
entire editor still discards a local source draft; durable draft persistence is not implemented here.

### Integrated checkpoint after access/draft/history changes

The editor, store, Markdown hierarchy and Markdown exporter suite passes 309 tests in 46 files with
two workers (`/tmp/notebook-editor-checkpoint-regression.log`). Production build also passes
(`/tmp/notebook-editor-checkpoint-build.log`), retaining large-chunk and browser-data warnings.
The completion-audit table above has been corrected to reflect the delivered whole-document source
UI rather than its earlier planned state. This checkpoint does not close broader virtualization,
cross-tab storage consistency, or the previously reported global TypeScript errors.

### Hybrid code editor lifecycle

Hybrid cells' code branch previously mounted CodeMirror regardless of viewport visibility, unlike
ordinary executable cells. `HybridCodeEditor` now reuses `useCodeEditorActivation`: deferred mounting,
focus activation, session capture/restore and delayed offscreen suspension share the existing
lifecycle implementation. Current cells remain pinned; read-only access removes mutation callbacks.
The code branch is a separate component so switching to the hybrid Markdown branch releases its
editor session. Hybrid activation and shared lifecycle tests pass 9 tests / 2 files
(`/tmp/notebook-hybrid-activation.log`). New tests cover deferred construction, latest streamed text
on activation, keyboard focus and read-only behavior. Actual large-hybrid-notebook browser instance
counts remain to be measured. This changes instance lifecycle, not eager JavaScript module loading.

Hybrid content parsing now uses the shared fence scanner rather than splitting every line, building
code through repeated concatenation and trimming its payload. The first complete fence retains exact
code whitespace; incomplete fences remain literal. Editing replaces only that fence, preserving
surrounding Markdown and growing delimiters when the payload includes fence-like lines. Parsing is
cached by source text per view model, invalidated on source change. This fixes the prior raw-code
writeback which discarded surrounding text and removed the wrapper on the first edit. Hybrid/fence
tests pass 24 tests / 3 files (`/tmp/notebook-hybrid-fidelity.log`). Mixed content still uses the
existing first-fence presentation; displaying all mixed segments is not addressed by this change.

Hybrid current-cell state now uses a boolean store selector in the React view instead of an
unsubscribed view-model getter. Selecting/deselecting a hybrid therefore updates its activation pin
without needing a content change, while unrelated notebook state changes do not rerender the code
branch. The obsolete getter was removed. Hybrid tests pass 6 tests / 3 files
(`/tmp/notebook-hybrid-current.log`), including real store selection updates and an unrelated-title
update that leaves the child render count unchanged.

Hybrid input callbacks resolve the latest published cell before replacing the displayed fence, so
streamed prefix/suffix text arriving before the view-model prop effect is preserved. Stale callbacks
do not write into a converted cell or overwrite remaining text after the fence was removed. Hybrid
tests pass 9 tests / 3 files (`/tmp/notebook-hybrid-live-update.log`). This is not character-level merge
of simultaneous edits to the same code payload; that payload still follows input replacement semantics.

Hybrid input now short-circuits unchanged payloads before fence serialization, preserving original
CRLF, indentation, fence lengths and info spacing on no-op callbacks and avoiding a store write.
Repeated assignments of the same processing state also skip subscriber notifications. Hybrid tests
pass 13 tests / 3 files (`/tmp/notebook-hybrid-noop.log`), including exact-source preservation and
notification counts. Actual edited fences still use the shared safe formatter.

Real Chromium hybrid-scale verification now passes for 100 fenced hybrid cells plus a title:
2 CodeMirror DOM instances initially and 3 after scrolling to cell 90, with the first editor
released and all 101 store cells retained. Script/log: `/tmp/notebook-hybrid-scale-browser.mjs` /
`/tmp/notebook-hybrid-scale-browser.log`. The diagnostic setup needed a rooted dynamic-import promise
to avoid CDP `Promise was collected`; earlier attempts yielded no valid measurements. These counts
verify viewport-driven instance lifetime for this fixture, not heap bytes or an asymptotic guarantee
for the entire notebook (all lightweight wrapper nodes are still mounted).

Shared editor activation now flushes a requested focus even when visibility has already created the
CodeMirror instance before the placeholder activation callback arrives. Previously only editor
creation or navigation flushed that request, so this ordering could leave focus pending. Tests cover
both activation/creation orders, single focus dispatch and unmount cancellation; activation/hybrid
component tests pass 11 tests / 2 files (`/tmp/notebook-editor-activation-focus.log`).

Post-hybrid type checking still reports 314 repository errors with no diagnostics in the modified
hybrid modules (`/tmp/notebook-hybrid-types.log`). Representation audit identified a remaining
inconsistency: `ConvertCodeToHybridAction` changes only cell type, retaining bare executable source,
whereas hybrid presentation recognizes code inside Markdown fences. Unifying conversion semantics
must account for both the stream action and generic store conversion; this is not resolved by the
recent fence-editor fidelity fixes and should not be hidden by guessing a language from bare text.

The conversion inconsistency above is now addressed at `CellModel`: code→hybrid wraps the exact
payload in a safe language-tagged fence; repeated hybrid conversion does not double-wrap. The stream
conversion action delegates to the same model as the existing store command. Reverse conversion
requires a complete standalone non-Mermaid fence, preserves whitespace and derives its language;
mixed surrounding prose and broken fences are no longer silently discarded. The pure fence utility
moved to `src/utils/markdown/fencedMarkdown.ts`, and all imports were migrated with no compatibility
re-export, keeping model code independent of editor components. Conversion/hybrid/fence/source tests
pass 91 tests in 7 files (`/tmp/notebook-hybrid-conversion.log`). Existing stored bare hybrid payloads
are not guessed or rewritten by a migration.

`updateCellObject` now delegates normalized publication to `setCells` rather than independently
mutating a cell and leaving task references stale. Metadata patches merge with the previous metadata
before replacement; the old merge occurred after Object.assign and had already lost prior fields.
Missing-cell and shallow no-op patches return without publication. Current-code→hybrid uses this
same path and preserves existing outputs instead of unnecessarily cloning the entire model payload.
Store/model/hybrid tests pass 31 tests / 5 files (`/tmp/notebook-object-publication.log`), verifying
metadata retention, canonical task references, heading re-derivation and no-op identity. Object
publication still copies/traverses the cell array; no O(1) update claim is made.

The stream code→hybrid action now publishes only the changed type/content fields, preserving the
existing output-array identity, and resolves its target using the shared cell index. Real-store action
tests cover explicit targets versus current-cell targets, unchanged neighbors, language/whitespace,
output identity and repeated conversion without duplicate publication/toasts. Action/store validation
passes 16 tests / 2 files (`/tmp/notebook-stream-hybrid.log`).

Reverse code conversion now publishes only a successful type/content/language change through the
same object-update path. Rejected conversions (including Mermaid), missing targets and already-code
cells do not replace snapshots or rebuild tasks. Successful conversion retains output identity and
canonical task references. Store/model/stream conversion regressions pass 21 tests / 3 files
(`/tmp/notebook-reverse-conversion.log`).

### Conversion integration verification

Production build passes after the shared utility migration (`/tmp/notebook-conversion-build.log`).
The expanded editor/store/export/stream suite passes 315 assertions in 51 files, but its command exits
nonzero because the fence test file was moved after discovery and the old path could not be loaded
(`/tmp/notebook-conversion-integrated.log`). Running that file at its new shared-module location passes
all 19 tests (`/tmp/notebook-relocated-fences.log`). Thus 334 tests across 52 files pass across these
two runs, not in a single all-green invocation. Formatting was applied to the newly introduced hybrid
components/tests and conversion tests. No compatibility file remains at the old fence utility path.

Text conversion now belongs to `CellContent` (type/content/language only), inherited by `CellModel`
to preserve its public methods and used directly by store/stream conversions. The previous temporary
full `CellModel` copied output arrays even though conversions never needed them. Conversion now never
accesses outputs or metadata; a throwing-getter regression proves that boundary. Text scanning/output
allocation remains proportional to the source size, but conversion's extra work no longer scales
with runtime-output count. Store/model/stream tests pass 25 tests / 6 files
(`/tmp/notebook-content-conversion.log`). This does not remove the downstream cell-array publication pass.

The conversion model itself now treats already-code input as a no-op, not just its store caller.
This prevents repeated conversion from stripping literal fence examples inside an executable cell
or changing its language. Model/store regression tests pass 21 tests / 2 files
(`/tmp/notebook-code-conversion-idempotence.log`).

Generic `updateCellType` now delegates to the shared object-publication path instead of duplicating
an Immer mutation and unconditional task reconstruction. Same-type or missing-cell requests leave
the entire snapshot unchanged; genuine code→Markdown type changes still rebuild heading ownership
without changing source text. Store/code-view-model tests pass 21 tests / 2 files
(`/tmp/notebook-type-publication.log`). This generic setter remains a type assignment, distinct from
the explicit content-format conversion commands.

Clean integrated rerun: 337 tests / 52 files pass in one invocation
(`/tmp/notebook-unified-publication-suite.log`). Type checking remains at 314 repository diagnostics
with none in the new content-conversion model, hybrid components, conversion tests/action or notebook
store (`/tmp/notebook-unified-publication-types.log`). Caller audit identified `ClearOutputsAction`
publishing once per populated cell; with document-level publication this repeats linear work and
notifications. It should batch the user operation into one publication rather than treating each
cleared output as an independent document edit.

Batch output clearing now uses the store's single `clearAllOutputs` operation, which returns the
cleared count to the stream action. It creates replacements only for nonempty outputs and publishes
once; repeated clearing publishes nothing. Single-cell clearing also shares canonical publication.
This removes k repeated O(n+r) publications for k populated cells, yielding O(n+r) batch work and
O(n) temporary cell-array space. The 1000-cell action test asserts exactly one subscriber notification,
unchanged empty-cell identity, retained old snapshots, canonical task references and zero notifications
on repeat. Store/action validation passes 26 tests / 6 files (`/tmp/notebook-batch-clear.log`).

Execution-output publication now refreshes task-owned cell references in the same Immer transaction,
without rebuilding Markdown hierarchy. The output helper resolves its target via the shared index
and exits early for missing cells. Store/batch-clear regressions pass 18 tests / 2 files
(`/tmp/notebook-runtime-output-refs.log`), including canonical output references, unchanged neighboring
cells, preserved old snapshots and zero hierarchy-parser calls for execution-output changes.

Output normalization now occurs after target existence checks, so results arriving after deletion
are ignored without reading their content. A throwing payload getter verifies that boundary.
The output helper also stops cloning already-serialized output items a second time and reuses its
newly normalized array for successful results. Store/batch-output tests pass 28 tests / 6 files
(`/tmp/notebook-stale-output-final.log`); output normalization remains linear in payload size.

Output-normalization compatibility tests additionally verify one `toJSON` invocation per structured
payload, input-object preservation, existing error/empty-result display markers and circular payload
string conversion. Output/identity tests pass 21 tests / 2 files
(`/tmp/notebook-output-normalization.log`), supporting removal of the redundant sanitizer pass without
changing these public display conventions.

Cell metadata/editability setters now use the shared patch-publication path, removing their separate
mutators which left task references stale. Metadata no-op detection compares only supplied own
fields with shallow identity (not JSON serialization), retaining explicit undefined assignments and
skipping empty/identical patches. Store/stream regressions pass 33 tests / 7 files
(`/tmp/notebook-metadata-publication.log`), covering fresh metadata, canonical references, editability
and repeated patch identity.

The stream `convert_to_code_cell` action now publishes type/editability/language/metadata together,
instead of three state updates exposing intermediate states. It replaces cleaned metadata through
`setCells`, since merging a metadata object with deleted keys reintroduced the old thinking fields.
Unrelated metadata, content and outputs are retained, language uses the canonical field and repeated
conversion is a no-op. Cell-action/store tests pass 21 tests / 3 files
(`/tmp/notebook-atomic-code-conversion.log`), including exactly one subscriber notification.

Full repository test audit: 59 files pass and one Workflow action-system test file fails; 367 tests
pass and 7 fail (`/tmp/notebook-full-worktree-suite.log`). Failures are a fixed expectation of 12
registered Workflow actions versus 32 actual actions, plus `jest.fn` calls under Vitest where `jest`
is undefined. That Workflow directory is unchanged in this worktree, and HEAD contains the same
12-action expectation. Editor/store/export/stream/autosave/IndexedDB tests pass in this run. This is
not an all-green repository test result; Workflow fixture modernization has not been performed as
part of the editor changes.

Hybrid Markdown export now emits its mixed Markdown source directly, rather than surrounding the
whole hybrid payload with another executable fence. Ordinary code cells still receive safe fences,
and outputs remain separately appended. A mixed prose/Python/Mermaid fixture verifies exactly the
intended code/diagram/output blocks, with no extra outer fence. Export/fence/conversion tests pass
30 tests / 4 files (`/tmp/notebook-hybrid-export.log`). Bare hybrid text is exported literally rather
than guessed to be executable code, consistent with the hybrid Markdown presentation.

Whole-document source now follows the same distinction: only executable `code` cells receive an
outer code fence; hybrid cells expose their existing mixed Markdown directly. Edited hybrid source
retains hybrid identity and live outputs, including deliberately broken inner fences. Code-cell
broken-fence transitions remain covered independently. Codec/session/dialog/application/render-service
tests pass 34 tests / 5 files (`/tmp/notebook-hybrid-document-source.log`). The per-cell executable
source transition still needs separate alignment for mixed hybrid content; this change addresses
whole-document source only.

Per-cell hybrid source transitions are now aligned: opening source exposes the mixed Markdown
directly, preview restores a hybrid with that source intact, and breaking a fence shortens the first
actual complete fence while retaining preceding/following prose. Caret placement uses the fence's
real offset, indent, delimiter and newline rather than assuming an outer backtick fence at offset 0.
Code-cell semantics remain unchanged. Transition/document-codec tests pass 57 tests / 2 files
(`/tmp/notebook-hybrid-cell-source-final.log`), covering mixed tilde fences, repair/reload and undo.

Hybrid source-preview reconciliation now retains store-owned language metadata. A mixed Markdown
body is not a standalone code fence, so the executable wrapper's default Python language must not
overwrite a hybrid's TypeScript metadata. Source-transition/reconciliation tests pass 49 tests / 2
files (`/tmp/notebook-hybrid-source-language.log`), including a mixed TypeScript/prose round trip.

Hybrid surrounding/body Markdown now uses a memoized renderer that delegates complete Mermaid
fences to the shared `MermaidPreview`. Markdown AST source offsets and the shared standalone-fence
validator prevent incomplete fences from rendering prematurely; ordinary code remains a code preview.
Mermaid is excluded from executable hybrid-fence selection and deletion, so a preceding diagram is
not mistaken for the editable Python block. The old global newline-to-two-spaces rewrite was removed
because it modified code/diagram source. Hybrid/preview tests pass 24 tests / 5 files
(`/tmp/notebook-hybrid-mermaid.log`), and source-transition tests pass 46 tests
(`/tmp/notebook-hybrid-diagram-fence.log`). Unit tests mock rendering output; the real-browser
validation below separately checks actual SVG rendering.

Hybrid code presentation now renders Markdown preceding and following its editable first fence,
instead of hiding those source segments. The view model derives boundaries from the same cached
fence parse used for safe editing, avoiding a second syntax heuristic. Hybrid tests pass 14 tests /
3 files (`/tmp/notebook-hybrid-prose.log`), including visible prose on both sides. Additional fenced
blocks in these surrounding segments currently use ordinary Markdown preview, not additional live
code editors; Mermaid fences use the shared preview described above.

### Hybrid diagram browser verification

An isolated Chrome profile against the local development server passed
`/tmp/notebook-hybrid-diagram-browser.mjs`. The fixture contains preceding prose, a Mermaid diagram,
intermediate prose, a Python fence and following prose in one hybrid cell. The test checks actual
Mermaid SVG creation, visible prose, exact source shown on entering Source, and SVG recreation after
Preview. Cell identity, hybrid type, Python language, exact source and existing output survive the
round trip, with no Mermaid error element. This is a functional browser check, not a rendering-time
benchmark or proof of arbitrary nested Markdown fidelity.

The follow-up 100-hybrid-cell browser probe retained all 101 cells (including its title), with
1 mounted CodeMirror editor initially and 2 after scrolling to cell 90; the first editor was released.
Counts vary with viewport placement. This demonstrates bounded heavy-editor mounting for this
fixture, not bounded total NodeView count or measured heap usage. Focused regression tests passed
98 tests across 8 files (`/tmp/notebook-hybrid-final-validation.log`).
Production build also passed (`/tmp/notebook-hybrid-final-build.log`), with bundle-size and
mixed static/dynamic import warnings still present. The isolated test Chrome process was stopped;
the application development server and user's browser were left running.

### Preserve hybrid diagram lifecycle during text updates

A regression test reproduced Mermaid component remounts when only preceding prose changed:
the Markdown `pre` renderer was defined inline, giving React a new component type on each render.
It is now a stable module-level renderer with scoped source context. Unchanged diagram components
retain their DOM and preview lifecycle across prose updates; changed diagram source reaches the
existing preview rather than creating a new instance. Breaking the closing fence still unmounts
the preview and displays literal code. The regression checks node identity, mount/unmount counts,
updated diagram payload and the broken-fence transition. Hybrid and Mermaid tests pass 25 tests
across 5 files (`/tmp/notebook-hybrid-stable-diagram-final.log`). This does not eliminate Markdown
parsing per source change or establish nested blockquote/list Mermaid support.

### Container-aware Mermaid fence recognition

Hybrid Markdown now registers a from-Markdown compiler extension through remark. Opening and
closing `codeFencedFence` events identify complete code nodes; a post-compile transform annotates
only closed Mermaid nodes with their parser-normalized payload. The stable preview renderer reads
that payload directly. This replaces the prior raw-source context and per-block second fence scan;
it does not change standalone fence conversion rules elsewhere in the editor.

Tests cover blockquotes, lists, combined quote/list nesting, missing/short closing fences and a
quote-prefixed fake closer inside a top-level code fence. Container prefixes never reach Mermaid,
and incomplete fences remain ordinary code. Lifecycle identity tests still pass. Related hybrid,
Mermaid and source transition suites pass 78 tests / 6 files
(`/tmp/notebook-nested-mermaid-final.log`). Type checking still fails repository-wide; its completed
run reports no diagnostics for `remarkCompleteMermaid` or `HybridMarkdown`
(`/tmp/notebook-nested-mermaid-types-final.log`). `unified` and `mdast-util-from-markdown` are now
declared direct dependencies at their previously installed versions rather than relying on
undeclared transitive imports. Nested-diagram tests mock Mermaid itself; real browser nested SVG
rendering has not yet been verified.

Follow-up browser verification now passes for three container fixtures: blockquote, list, and a
list nested inside a blockquote. `/tmp/notebook-hybrid-diagram-browser.mjs` runs against isolated
Chrome and checks actual SVG creation, enters Source, replaces text through Chrome's input API
with a shortened closing fence, and returns to Preview. Each broken fixture has literal code and
no diagram SVG. Re-entering Source and restoring the closing fence restores the actual SVG; exact
source and existing outputs survive. The top-level mixed-prose/Python/Mermaid round trip also
continues to pass. This covers these concrete nesting forms, not every CommonMark container case.

### Eliminate hybrid effect-driven duplicate content renders

A component regression reproduced two code-child renders for one source-prop update: the hook
first returned its old mutable model, then updated that model in an effect and forced another
render through a subscription. The hook now memoizes a render model by cell identity, type and
source directly. Output-only or metadata-only changes retain that model and its fence parse cache;
new source is available in the first render without mutating the previous render's model.
Editing callbacks continue to resolve the latest store cell before applying a change.

The unused local `isProcessing` state and its inert click handler were removed with the obsolete
subscription/update effect. This does not redesign the existing generation indicator. Tests verify
one code-child render per source update, model reuse for output changes, replacement for source/ID
changes and preservation of the previous render model. Hybrid/Mermaid suites pass 33 tests / 6 files
(`/tmp/notebook-hybrid-single-render.log`); no wall-clock or heap improvement is claimed from render
counts alone.

### Keep source draft keyboard history separate from notebook shortcuts

The notebook keyboard hook handles document-level undo even when the target is a textarea.
The whole-document source dialog previously allowed draft key events to reach that handler.
The dialog now stops keydown propagation without preventing default, so native draft undo/redo,
Tab traversal and composition remain owned by the modal rather than mutating the live notebook.
Five regression cases failed before this change and pass afterward (Cmd/Ctrl undo, Shift-Cmd redo,
composition Enter and Tab). Source dialog/input suites pass 23 tests / 3 files
(`/tmp/notebook-source-shortcut-after.log`). These tests cover bubbling listeners; capture-phase
slash-menu listeners require separate focus-scope review. Whole-document indentation/history
parity with the transaction-backed per-cell source editor remains incomplete.

The capture-phase TipTap slash menu is now explicitly scoped to its own menu or owning editor DOM.
Nested textarea/input/select/CodeMirror controls and unrelated modal targets are excluded before
any preventDefault or command execution. Composition events, including keyCode 229, are ignored.
Read-only/destroyed editors reject keyboard commands; menu clicks enforce the same access check.
Tests reproduced the previous source-input interception and composition-Enter execution, then
verified their removal, preserved rich-text/menu input, and revoked-access behavior. Menu and
source-dialog suites pass 16 tests / 2 files (`/tmp/notebook-slash-scope-final.log`). This closes the
capture-phase interference found above; it does not yet add whole-document source indentation.

### Stop idle hybrid generation animations

Hybrid cells previously rendered a spinning loader, pulsing gradient and empty-content "AI is
Thinking..." placeholder regardless of generation state. Presentation now reads the existing
metadata lifecycle: `isGenerating === true` and no truthy `generationCompleted`. Completion or
`isGenerating: false` removes the status and continuous animations; absent metadata is idle.
The colored gradient remains static rather than being removed, and active animations honor
reduced-motion preferences. No new competing lifecycle state is introduced.

The regression failed against the unconditional indicator and now covers idle, generating,
completed and explicitly stopped metadata, including retained gradient styling. Hybrid suites
pass 27 tests / 5 files (`/tmp/notebook-hybrid-generation-final.log`). This removes unconditional
animation work from completed cells; GPU/paint-time savings have not been measured.

### Expanded verification after source, Mermaid and hybrid updates

`npm run build` passed in 1m24s (`/tmp/notebook-expanded-current-build.log`), still with existing
large-chunk/import warnings. Running the entire test suite concurrently with that build produced
393 passes and 8 failures: the seven known Workflow test failures plus a 5-second timeout in the
1000-cell projection-cache test. No timeout or assertion was relaxed.

After the build exited, `npx vitest run --maxWorkers=2` completed with 394 passes and 7 failures,
62 passing files and 1 failing file (`/tmp/notebook-expanded-limited-tests.log`). The projection
test passed in 1131ms with its exact three-serialization and unchanged-cell identity assertions.
The remaining failures are all in the untouched Workflow `action-system.test.ts`: an obsolete
12-action count against 32 registered actions, and six cases using unavailable `jest.fn` under
Vitest. This supports resource contention as the timeout explanation but is not a controlled
performance benchmark. The repository-wide test gate remains red; broader editor/source/storage
requirements in the completion audit remain open.

### Retain diagram geometry while source changes

A regression reproduced a ready 360px Mermaid preview shrinking to the default 80px placeholder
when its source changed. Ready previews now measure their geometry in a layout effect and retain
the latest positive height via ResizeObserver. Source/theme changes can reuse that height while
rendering; zero-sized hidden ancestors do not erase it. The observer exists only for a ready
preview and disconnects when that result is replaced or unmounted. This is a per-preview constant
amount of state and does not retain additional SVG copies.

Tests cover initial measurement, a resize to 520px, an intervening zero measurement, loading
placeholder height and observer cleanup. Mermaid/hybrid Markdown tests pass 18 tests / 2 files
(`/tmp/notebook-mermaid-layout-final.log`). This verifies component geometry decisions, not a
browser-wide cumulative-layout-shift benchmark.

### Cross-platform broken-fence regression matrix

Added scanner round trips across LF/CRLF/CR, both delimiter kinds, zero/one/two trailing newline
sequences, Unicode/emoji, blank lines and delimiter-like code payloads. Assertions verify exact
payload bytes and reassembly of surrounding Markdown from scanner segments. Added notebook parser
cases for each newline form with a shortened closing fence: no code/diagram node is synthesized,
and all literal lines (including an empty line) remain in the preview paragraph. All 32 tests in
the scanner/parser suites pass (`/tmp/notebook-source-newline-matrix.log`); no implementation change
was necessary for these cases. This verifies parsing/projection, not OS-specific clipboard/IME
integration or byte preservation after a browser textarea intentionally normalizes line endings.

### Retain raw-cell drafts after editing access changes

Raw-cell blur previously cleared the local draft when the access context had become read-only.
A regression reproduced loss of unsaved text. Save now leaves that draft visible with an explicit
not-editable message and performs no store/node write; editing can be retried after access returns.
The existing explicit Escape cancellation behavior is unchanged. Additional cases verify that
composition Enter/Escape, including keyCode 229, neither save nor discard Chinese draft text.
Raw/source-history tests pass 18 tests / 2 files (`/tmp/notebook-raw-draft-access-final.log`). These
are synthetic composition-key tests, not a real OS IME composition/blur sequence verification.

### Validate live raw-cell ownership at save time

Three new regressions reproduced stale raw drafts overwriting a cell edited, converted or removed
in the store before React refreshed its props. Save now resolves the cell through the shared ID
index at invocation time, rejects converted/deleted store-owned targets, and checks the latest
content against the draft base. Conflicts retain the draft. Store ownership is captured when
editing starts, preserving the pre-hydration node-only editing case without treating deletion as
unhydrated data. Read-only/destroyed editor instances also reject saving. External raw-node
synchronization now ignores cells already converted to another type.

Raw-cell regression tests pass 12 tests (`/tmp/notebook-raw-live-final.log`), including all three
pre-refresh races and the existing permission, conflict, hydration and composition cases.

Raw drafts additionally capture their originating cell ID. A regression reused a node view for a
different ID with identical base content; previously the local draft was written to the new cell.
Save now rejects that identity change before any store/node write and retains the original draft
for copying or explicit Escape cancellation. Raw tests pass 13 cases
(`/tmp/notebook-raw-identity-final.log`), including this formerly failing cross-cell write.

### Fail closed when checking existing content before an empty save

Autosave previously caught failures reading existing content and explicitly allowed the empty
snapshot to proceed. Corrupt JSON was also swallowed by the loader, permitting a metadata-only
empty result. Both paths could replace content without establishing that the notebook was empty.
Read/parse failures now propagate: no notebook metadata/file write occurs, and the failed revision
remains queued and dirty under the existing retry lifecycle. Corrupt-file loads emit load_failed,
not load_completed. Successful missing-file metadata lookup remains supported.

The two overwrite regressions failed before the change. Autosave tests now pass 10 cases
(`/tmp/notebook-empty-save-final.log`), including a successful retry once reading returns a valid
empty notebook and explicit corrupt-load failure. This closes a local overwrite risk; it does not
provide cross-tab compare-and-swap or atomic metadata/content transactions.

Stored JSON must now contain an explicit cells array; a root array, missing/null/object cells,
or a present non-array tasks field is rejected as an invalid notebook structure. Previously these
shapes were silently converted to empty arrays and could authorize an empty overwrite. A missing
optional tasks field still loads as an empty task list. Five malformed-shape regressions failed
before the change; autosave now passes 16 tests (`/tmp/notebook-load-structure-final.log`), checking
both load rejection and retained, non-writing empty-save failures, plus a valid empty notebook.
This is container-shape validation, not yet a complete validation of individual cell/task records.

### Prepare complete save records before publication

A regression with circular cell metadata reproduced a notebook-metadata write before JSON
serialization failed. Autosave now prepares metadata, serializes the content and calculates its
file byte size before the first persistence write. Serialization errors leave both persistent
records untouched and the revision queued for retry/replacement. The file format and valid-save
write sequence remain unchanged. Autosave tests pass 17 cases
(`/tmp/notebook-save-prepare-final.log`). Storage failures between the two writes remain possible;
this preflight ordering is not a substitute for a multi-record atomic transaction. Full-snapshot
serialization and output-size calculation still entail repeated work and remain optimization gaps.

Revision-recovery tests now verify that a failed in-flight old revision is not retried after a
new edit supersedes it: persistence sees exactly old/new, and completion leaves no pending dirty
revision or stale error. A separate test replaces an unserializable queued draft with a corrected
snapshot and verifies exactly one successful content write. Both pass without implementation
changes; autosave suite now passes 19 tests (`/tmp/notebook-save-revision-recovery.log`). These
checks confirm single-process recovery, not cross-tab conflict resolution.

Existing files with an empty string or unavailable (null/undefined) content are no longer treated
as missing files. They fail loading and empty-save protection instead of falling through to an
empty metadata-only notebook. Metadata-only loading is retained only when getFile genuinely
returns no record. Three formerly failing content-availability cases and the valid absent-file
case bring the autosave suite to 23 passing tests (`/tmp/notebook-empty-file-final.log`).

### Reuse unchanged cell-text byte measurements

Autosave size accounting now caches each cell's body byte count with a WeakMap and validates the
cached content string before reuse. Unchanged immutable cells avoid constructing another Blob
for their text on every save; in-place text changes also invalidate correctly. Weak keys do not
retain discarded cell snapshots. The metadata accounting pass remains O(cell count + newly
measured text + serialized outputs), and full-file serialization is still O(snapshot size).
Output arrays are deliberately not identity-cached because this service's public snapshot API
does not guarantee deep immutability. Tests verify one measurement across an unchanged Unicode
body/title-only save, exact UTF-8 size and correct invalidation after mutation. Autosave passes
24 tests (`/tmp/notebook-save-size-cache.log`). No wall-clock improvement is claimed without a
representative benchmark.

### Unified local history for whole-notebook source edits

The whole-document source textarea now has an independent CodeMirror state/history model, without
mounting a second editor view. Typing updates, Mod-[ / Mod-] indentation and Add-cell commands
share that history; Mod-Z / Shift-Mod-Z / Ctrl-Y operate on the draft, never the live notebook.
Programmatic additions/indentation form isolated undo units and directional selections restore
synchronously. Tab traversal and composition-key guards remain unchanged. Apply remains the
single publication boundary into notebook history.

`SourceDraftHistory` computes one replacement from common prefix/suffix and stores CodeMirror
inverse changes instead of retaining a full source snapshot per undo entry. Diff discovery is
still O(source length) in the worst case, and whole-buffer controlled text remains; this is not
an incremental editing-time guarantee. History/interaction tests pass 16 tests across 2 files
(`/tmp/notebook-source-draft-final.log`), covering indentation undo/redo, Add Python undo, no live
store mutation, selection direction, Unicode and redo invalidation. Native browser context-menu
undo and real OS IME integration still need browser verification.

An isolated Chrome run now verifies the whole-document draft keyboard path against the actual
app: CDP text input, Ctrl-Z/Shift-Ctrl-Z, line indentation with a backward selection, indentation
undo, Add Python undo, and Cancel without changing the live notebook. All checks pass in
`/tmp/notebook-source-history-browser.mjs`. This confirms keyboard integration with the textarea,
not native context-menu undo or OS IME behavior. The browser test closes any prior test modal before
seeding its fixture so a previous failed probe cannot leave a stale source session behind.

The source dialog now handles cancelable native `beforeinput` historyUndo/historyRedo events with
the same draft history as keyboard shortcuts, preventing a second native undo stack from applying
its own change for those events. Non-composing beforeinput also records the pre-edit selection.
The listener has stable dependencies and is removed on unmount. A native InputEvent regression
failed before the change; dialog/history tests now pass 17 tests
(`/tmp/notebook-native-history-final.log`). This verifies event routing, not whether every browser
enables its native undo menu after programmatic changes; noncancelable events remain native-owned.

Additional source-dialog tests verify replacement of a backward selection with Chinese text and
restoration of its exact range/direction on undo. Composition and keyCode-229 cases confirm that
undo/indent/outdent shortcuts neither prevent the composition event nor alter the draft/history;
a subsequent ordinary undo still works. Dialog/history suites pass 20 tests
(`/tmp/notebook-draft-selection-ime.log`). No runtime change was required for these cases; real
platform IME composition sessions remain distinct from these synthetic event checks.

Whole-source toolbar now exposes Undo/Redo draft buttons for pointer/touch access. Their disabled
state comes directly from CodeMirror history depth, and execution uses the same history and
selection restoration as keyboard/native-event paths. Successful actions return focus to the
source input without scrolling the page. Dialog/history tests pass 21 cases
(`/tmp/notebook-draft-history-buttons.log`), including disabled-state transitions, Add Python
undo/redo, focus restoration and unchanged live cell count. Narrow-screen layout after adding
these two controls has not yet been rechecked in the browser; the existing toolbar wraps.

Follow-up isolated Chrome verification passes at 1280×720 and 320×720 after adding history controls.
The toolbar wraps without horizontal overflow; all seven dialog buttons stay inside its bounds.
For a 51-cell fixture, Add Python → Undo → Redo restores the textarea focus, opener-adjacent caret
and bottom scroll position, then actual input and Apply produce the expected code content.
`/tmp/notebook-source-layout-browser.mjs` records the assertions and measured bounds. Short-height
landscape and screen-reader navigation are not covered by this check.

### Avoid redundant diff discovery for known source insertions

SourceDraftHistory now exposes a known-range replacement command backed by the same transaction
and history publication path as ordinary edits. Add-cell uses its known append boundary and new
suffix directly instead of walking the full unchanged prefix again. Validation of notebook
boundaries still scans the document, and controlled-buffer construction still exists; total add
complexity is not constant. A 10,000-line prefix test checks append/undo/redo and caret restoration.
Source history/dialog suites pass 22 tests (`/tmp/notebook-source-known-edit.log`).

Whole-source indentation now also supplies its known replacement range directly to draft history.
The shared indentation utility computes selected-line edits once; per-cell textarea callers can
still materialize the full result through the same implementation. This removes the extra
full-buffer diff search and an intermediate full-result construction for whole-source commands.
Unchanged outdents update selection without creating an undo entry. A 10,000-line prefix test
checks the exact bounded replacement, while existing caret/directional selection behavior remains
covered. Four suites pass 30 tests (`/tmp/notebook-known-indent.log`). Controlled textarea updates
still materialize the final source buffer; the entire UI operation is not O(selected text) only.

### Full regression after draft-history and save-protection changes

`npx vitest run --maxWorkers=2` completes with 434 passing and 7 failing tests across 64 files
(63 pass, 1 fails), recorded in `/tmp/notebook-current-full-tests.log`. All seven failures remain
in the untouched Workflow action-system test (old registration count and Jest mocks under Vitest).
No new suite failed in this run. The global test gate remains red; this result does not close the
incomplete items in the completion audit.

The subsequent production build passed (`/tmp/notebook-current-production-build.log`), with
large-chunk and mixed static/dynamic-import warnings still present. Tests and build were run
sequentially to avoid the resource-contention timeout observed in the earlier parallel run.

### Single active source session per trigger

A repeated trigger invocation while the source modal was open replaced its session object but
retained the mounted dialog's old buffer/history. Add-cell then failed boundary validation against
the new session token. The trigger is now disabled while its session exists and its handler also
guards against reentry. The current draft remains intact until Apply/Cancel. The regression failed
before the change and now verifies repeated-trigger → Add Python → Apply preserves edited content;
all 20 dialog tests pass (`/tmp/notebook-source-reopen-final.log`). This hardens programmatic/repeated
activation; native modal inertness already blocks ordinary clicks behind the dialog.

Lifecycle tests now also close via both Cancel and Apply, check trigger re-enablement/focus,
then reopen and verify the appropriate current content with empty undo/redo history. Both pass
without a runtime change; all 22 source-dialog tests pass
(`/tmp/notebook-source-session-reset.log`). This covers explicit close/reopen, not draft recovery
after route navigation, refresh or a crash.

A cross-layer dialog regression now opens a CRLF code cell, confirms the source buffer uses LF,
indents two lines, undoes the change, and applies. The unchanged original store array is retained
by reference, including exact CRLF/trailing-newline bytes. This verifies that draft normalization
and undo do not cause a spurious persisted rewrite. All 23 dialog tests pass
(`/tmp/notebook-draft-crlf-history.log`); no runtime change was required for this path.

### App-lifetime ownership of unapplied source drafts

NotebookSourceDraftRegistry owns a session and its change-based history per stable notebook ID.
Source-button unmount detaches the UI without dropping edited drafts; reopening the same notebook
retrieves the same base/reconciliation session and undo history. Apply/Cancel explicitly release
the record, and clean detaches release it as well. Anonymous notebooks cannot be safely identified
across navigation and are not retained. Attach/detach is reversible for React effect replay.

Registry, session and dialog tests pass 32 cases (`/tmp/notebook-source-navigation-final.log`),
including edit → unmount → remount → resume → apply, separate notebook identities, history reuse,
and clean/anonymous release. Drafts still live only in application memory: refresh/crash recovery
is absent, actual router navigation remains to be browser-tested, and retained dirty drafts consume
memory until explicitly applied/cancelled. This is lifecycle ownership, not durable persistence.

### Serialized route transitions (browser investigation still open)

Actual home → workspace navigation exposed independent asynchronous disconnect/cleanup and
connect operations in useRouteSync. A late home cleanup could clear an already-returned workspace.
RouteTransitionCoordinator now owns these operations for the application lifetime, finishing the
active transition before processing the latest pending destination. Queue storage is O(1), each
request is O(1), and intermediate pending destinations are coalesced. This does not make notebook
loading or saving O(1). The hook no longer subscribes to the complete notebook store and delegates
already-loaded activation to the session service instead of skipping session activation itself.

The focused route/source/autosave suite passes 59 tests across five files
(`/tmp/notebook-route-source-validation.log`). Real-browser navigation now returns to the persisted
fixture, but the full draft/history scenario still fails: its source-button activation occurs during
the returning editor's transitional lifetime and the expected dialog does not remain mounted.
The transient old-editor/readiness boundary still needs investigation. Do not count actual-route
draft recovery as verified; component-remount coverage is not a substitute. No claim of full-suite
or production-build validation is made for this latest route change.

### Route readiness boundary and verified source-draft return

The coordinator now publishes stable idle/pending/ready/error snapshots. useRouteSync exposes
readiness only when the ready destination matches the current router pathname. NotebookApp does
not mount the editable content or workspace action header until that boundary is satisfied;
failures display an error with an explicit retry. This also prevents creation on the home page
while its preceding notebook cleanup remains in flight. Readiness belongs to the complete route
transition, not merely the notebook store's isLoaded flag (which can still describe the old data).

An integration regression holds home cleanup unresolved, returns to the same workspace, and
checks that it is not ready and has not reconnected prematurely. It also verifies failed save
does not proceed to cleanup and that retry recovers. Observable coordinator tests check stable
snapshots, subscription cleanup, duplicate requests and coalescing. The focused route/source/save
suite passes 61 tests / six files (`/tmp/notebook-route-readiness-tests.log`); the subsequently
expanded failure/retry case passes with coordinator tests (`/tmp/notebook-route-retry-tests.log`).

The real Chrome source-history scenario passed three consecutive runs: actual typing undo/redo,
backward selection, indent undo, added-cell undo, home → workspace navigation, exact draft and
history recovery, unchanged live cell, then explicit Cancel. No test-only delay or second click was
added to bypass the prior failure. Source-dialog layout/edit/apply checks also pass at widths 1280
and 320 without horizontal overflow. These results supersede the preceding unresolved browser
navigation entry, not the remaining refresh/crash or native OS input-method gaps.

Production build passes in 52.58 seconds (`/tmp/notebook-route-readiness-build.log`) with the large
bundle warning still present. TypeScript checking still fails elsewhere in the repository; the
route readiness files have no diagnostics (`/tmp/notebook-route-readiness-types.log`). This is
not a full-goal completion claim and no commit has been created.

### Preserve existing fence formatting during body edits

Hybrid body edits previously regenerated the whole fence with formatCodeFence, dropping opener
indentation, info-string spacing, CRLF/CR separators, a longer closing delimiter and closing-line
whitespace. Changed fenced-code and Mermaid serialization had the same normalization behavior.
They now share replaceFencedCode: preserve the existing wrapper, replace the payload, and grow
delimiters only when an embedded closing candidate requires it. New fences still use
formatCodeFence; both paths share delimiter-length selection instead of duplicating that logic.

The replacement scans the edited payload in O(k) time for unsafe closing candidates and allocates
the resulting fence. Hybrid publication still concatenates the containing cell (O(cell length));
this does not claim constant-time string editing or whole-notebook virtualization. No per-line
array is allocated. Empty fences acquire a necessary body separator; a terminal payload CR is
protected from merging with an LF closing separator and disappearing on the next parse.

Tests cover exact wrapper bytes for LF/CRLF/CR, empty and populated fences, terminal newlines,
embedded delimiters, longer closers, hybrid updates and both Markdown/Mermaid serializers. The
broader fence/source-transition/hybrid/table suite passes 113 tests / nine files
(`/tmp/notebook-fence-fidelity-final.log`). Existing break/repair, undo and source round-trip tests
remain green. No new real-browser or production-build claim is made for this formatter change.

### Fence input rules: prevent surrounding-text replacement

CodeBlockExtension had two duplicated rules with unanchored matches. Their handlers replaced
the entire containing block, so a fence-like suffix could discard preceding prose; conversion at
the start of a paragraph could also discard text after the caret. The consolidated InputRule now
requires a paragraph, a match beginning at that paragraph's start, and an input range ending at
its end. Headings and partially matched paragraphs are left to normal text input. Existing bare
fence and language-prefix insertion behavior is retained; this is not an Enter-based fence-entry
redesign.

The rule uses Tiptap's actual InputRule/transaction types instead of hand-written state shapes,
and the executable-block commands now have a registered typed command interface. Commands copy
attributes before supplying an ID rather than modifying caller-owned objects. Input-rule tests
exercise the actual ProseMirror handleTextInput plugin and undoInputRule for Python, JavaScript,
TypeScript, Bash and the Python default, plus preceding text, following text and heading guards.
The rule/source-transition/slash-command suite passes 59 tests / three files
(`/tmp/notebook-input-rules-final.log`). Repository TypeScript errors remain elsewhere; the
CodeBlockExtension diagnostics present before this refactor are absent from the check so far.

### Confirm language before converting typed fences

The preceding input-rule behavior still converted immediately on the third backtick, preventing
character-by-character entry of Mermaid or another language. Conversion now requires a confirming
space/tab or Enter. The shared commitFenceInput operation validates the whole paragraph, preserves
the complete language identifier (normalizing known aliases rather than guessing prefixes), and
is used by both input rules and Enter. Bare confirmed fences retain the Python default. Mermaid
creates a diagram node, never an executable Python cell.

Ownership is explicit: a single-paragraph Markdown cell becomes an executable cell with its
existing ID; a fence inside a larger Markdown cell/list/quote becomes a non-executable nested code
block without replacing siblings. Mermaid remains a diagram within its Markdown owner. The
operation inspects paragraph/ancestor boundaries and replaces only that range, without scanning
the notebook. Enter leaves compositions and nonempty selections alone.

Input/source-transition/title regression tests pass 73 cases / three files
(`/tmp/notebook-fence-confirm-final.log`). The expanded input suite passes 20 cases, including
Mermaid entered one character at a time followed by space, full language entry followed by Enter,
undo, original cell identity, sibling preservation, and before/after-text guards with the actual
confirming space (`/tmp/notebook-fence-sequential-tests.log`). TypeScript still reports unrelated
repository errors, but no diagnostics for the new fence-input model or CodeBlockExtension
(`/tmp/notebook-fence-confirm-types.log`). Native-browser focus after creating an empty diagram
is not newly verified by these plugin-level tests.

### New Mermaid input focus: browser verified

A selected, editable empty Mermaid node now opens source mode after the insertion transaction,
letting the existing source-view focus/selection logic take ownership. Unselected imported nodes
and read-only nodes do not auto-focus. Explicit Preview still works for an empty diagram; mode
changes do not publish document content.

The focused Mermaid/input-rule suite passes 26 tests (`/tmp/notebook-mermaid-insertion-focus.log`).
An isolated Chrome run (`/tmp/notebook-mermaid-insertion-browser.mjs`) verifies the complete real
input path: type the Mermaid fence character by character into the identified Markdown cell,
press Enter, observe active Mermaid source textarea without another click, enter a flowchart,
verify store text under the same cell ID, and switch to a rendered SVG preview. The first browser
fixture accidentally selected the editor's trailing paragraph rather than its named test cell;
correcting only that selection target made the end-to-end assertions pass. This supersedes the
preceding unverified empty-diagram focus note, not other outstanding completion requirements.

### Schema-aware nested fence placement

New regression tests reproduced misplaced selections for both code and Mermaid inserted into
the first paragraph of a list item: ProseMirror fitted a required leading paragraph automatically,
but the fence-input command selected the old offset. commitFenceInput now checks the immediate
container's replacement constraints, explicitly includes a required leading paragraph when valid,
and selects the actual inserted node offset. If neither replacement is valid, it declines without
changing the transaction. No notebook-wide traversal is added.

Both new list selection tests failed before this change (`/tmp/notebook-nested-fence-before.log`).
Afterwards, input/source-transition tests pass 70 cases (`/tmp/notebook-nested-fence-after.log`).
The subsequently expanded input suite passes 24 cases including list undo, quote containment,
table-cell containment, retained neighboring table text, schema validity and persistent cell IDs
(`/tmp/notebook-fence-containers-final.log`). These are transaction/plugin tests; this entry does
not claim a new browser or production-build run.

### Read-only fence input guard

An actual handleTextInput plugin regression showed that a confirmed fence still mutated the
document after editor.setEditable(false). Native contenteditable restrictions are not a substitute
for the handler's own editability check when a callback is invoked programmatically. The rule now
declines for a destroyed or non-editable editor before preparing any replacement. The test failed
before the change (`/tmp/notebook-fence-readonly-before.log`) and the input/Mermaid/source-transition
suite passes 79 tests afterwards (`/tmp/notebook-fence-readonly-final.log`). This protects this UI
entry point; it is not a claim that programmatic Tiptap commands form an authorization boundary.

Latest complete Vitest run: 486 passed / 7 failed, 68 passed files / one failed file (69 total),
68.89 seconds (`/tmp/notebook-current-full-regression.log`). All seven failures remain in the
unchanged Workflow action-system test file: outdated registration count and Jest-only mocks under
Vitest. The full suite is not green; these failures are recorded rather than excluded or relabeled.

### Remove unused create/demo cell projection

WorkspacePage previously called getCurrentViewCells before choosing its mode, then discarded the
result in both create and demo modes. The getter maps every selected cell into a fresh object and
maps/deserializes its outputs; in create mode it selects the entire notebook. Its invocation now
belongs only to the fallback/complete view that actually renders those returned cells. Thus each
create/demo render avoids that projection's traversal and temporary allocations; it does not make
the entire editor render constant-time or remove the complete view's projection cost.

Three WorkspacePage tests pass: create and demo rerenders never invoke a throwing projection spy,
and switching create → complete → create invokes the getter only for complete while retaining its
cell and navigation rendering. This is structural call-count evidence, not a measured browser
latency improvement. No other getter callers or output representation contracts were changed.

### Avoid repeated position scans in cell rendering

MarkdownCell only needs to know whether it owns the first cell, but its selector previously used
findIndex over all cells. It now compares the first ID directly: constant-time work per selector,
with the same default-title metadata/style checks. JupyterNotebookEditor now uses the existing
weakly cached cell-position index for render-time positions and move lookup, rather than running
findIndex once per rendered cell. For one immutable array, all positions cost O(n) construction
plus O(1) per lookup, instead of O(n²) for a full render. Moves still copy the array, and a new
immutable snapshot needs a new index. No additional cache/compatibility layer was introduced.

Shared-index, title-editing and workspace-mode regressions pass 10 tests
(`/tmp/notebook-render-index-tests.log`). The index test covers 1000 lookups, reuse, missing IDs,
immutable updates and reorder invalidation. These checks do not constitute a new rendered
Jupyter/Markdown visual check or a measured browser speedup.

### Drag preview ownership and reused lookup data

DraggableCellList now stores only the active ID, deriving the overlay from the current immutable
cell array. It no longer retains a stale cell object captured at drag start; updates appear in the
overlay and removal hides it. Sortable IDs are memoized by the array, and position lookups reuse
the existing weak cell index. That index now accepts the minimal structural ID contract so the
drag component and store-backed editors share its implementation; no second index cache was
added. Disabled lists do not build sortable IDs or resolve an overlay position.

Three drag/index tests pass (`/tmp/notebook-drag-projection-tests.log`), covering stable sortable
IDs across drag-state renders, current-content overlay/reorder, removed cells, same-position and
missing-target no-ops, plus shared index invalidation. These tests mock the drag sensor shell;
native pointer/keyboard drag behavior and browser frame-time effects are not newly measured.

### Disabled drag sessions cannot publish stale reorder callbacks

A regression demonstrated that invoking the previously registered onDragEnd after disabling the
list still called onCellsReorder (`/tmp/notebook-drag-disabled-before.log`). The sortable sensor
and active-ID state now belong to an enabled-only child component. Disabling unmounts that owner;
its layout-effect cleanup invalidates its callbacks, and re-enabling creates a fresh idle owner.
The disabled branch does not instantiate drag sensors or build sortable IDs. Public props and
rendered-cell behavior are unchanged.

Six drag/workspace tests pass (`/tmp/notebook-drag-disabled-final.log`), including an old callback
invoked both while disabled and after re-enabling, no resumed overlay, and existing live-content
and reorder checks. Native sensor behavior is still not newly browser-tested in this entry.

### Delayed drag completion uses committed current data

Capturing onDragEnd before a cell update reproduced a stale write: the overlay displayed new
content but the retained callback reordered and published the old objects
(`/tmp/notebook-drag-latest-before.log`). The enabled session now keeps a layout-effect-updated
reference to its committed cells and reorder callback. Completion reads that reference, so delayed
callbacks neither overwrite intervening edits nor resurrect cells removed during the drag. This
adds constant-size bookkeeping, not another cell snapshot or index.

Four drag/index tests pass (`/tmp/notebook-drag-latest-final.log`), with completion callbacks
captured before content updates, deletion of both formerly valid source/target IDs, and disable
cycles. These deterministic callback tests do not replace native sensor/browser verification.

### Current integrated build/type gate

After the fence, route-readiness and drag/index changes, `npm run build` passes in 49.55 seconds
(`/tmp/notebook-editor-current-build.log`), still with the large-chunk warning. `tsc --noEmit`
fails with 309 diagnostics (`/tmp/notebook-editor-current-types.log`), the same count as the prior
fence-confirmation check. No diagnostics name cellIndex, DraggableCellList, WorkspacePage,
fenceInput, CodeBlockExtension, useRouteSync or RouteTransitionCoordinator. This is a successful
production-bundling gate, not a claim of repository type correctness or completion of the goal.

The secondary MarkdownCell renderer still warrants follow-up: its custom code renderer returns
a pre element for language-tagged blocks and renders Mermaid directly, unlike the already-audited
hybrid complete-fence path. Its wrapper structure and incomplete-diagram behavior need concrete
render tests before assuming parity between notebook editor modes.

### Shared complete-fence preview renderer

MarkdownCell and HybridMarkdown now share stable markdownCodeComponents, paired with the existing
remarkCompleteMermaid compiler extension. Diagram substitution belongs to the pre renderer;
ordinary code uses ReactMarkdown's code element. The obsolete MarkdownCell-specific CodeBlock
component was removed, eliminating its nested pre wrapper and its language-name-only Mermaid
decision. Completed diagrams render outside pre; incomplete fences remain code. Component
identity remains stable during prose updates so diagram lifecycle state is not recreated.

Twelve shared-renderer/hybrid tests pass (`/tmp/notebook-shared-markdown-preview.log`), including
one pre/code wrapper, c++ language preservation, inline code, Mermaid closure/break/repair, and
existing nested-fence/hybrid behavior. MarkdownCell's separate whole-source newline rewrite is
still present and needs follow-up; these renderer tests do not prove that preprocessing preserves
every original code byte. No new full build or native-browser gate is claimed here.

### Prose line breaks without source rewriting

MarkdownCell now passes its original content directly to ReactMarkdown. Its previous whole-source
newline replacement inserted trailing spaces into code and Mermaid payloads as well as prose.
Paragraphs instead use white-space: pre-line, retaining visible soft line breaks even around inline
formatting. The separate paragraph split/reduce renderer was removed. This avoids a full source
replacement/intermediate string and per-paragraph break-element allocation; Markdown parsing and
rendering retain their own costs. It changes presentation, not persisted source.

Thirteen shared Markdown/hybrid tests pass (`/tmp/notebook-markdown-soft-lines.log`). The added
mixed-content check verifies paragraph soft-line styling and bold text, unchanged Python line
contents, and exact Mermaid payload. This supersedes the prior remaining newline-preprocessing
note. Native-browser typography/selection behavior has not been newly verified for this CSS change.

### Typed Markdown table renderer boundaries

Tables now have a div wrapper rather than a phrasing-only span. Table/row/cell/link renderers strip
parser-only node props, preserve native attributes and caller styles, and use HTML element types
plus ReactMarkdown ExtraProps. The component map uses Components instead of a broad Record cast.
Five element/preview tests pass (`/tmp/notebook-markdown-element-tests.log`), covering wrapper
structure, no leaked node attributes, GFM alignment, colspan and minimum width. TypeScript errors
decrease from 309 to 308; the map incompatibility is resolved but the file-preview argument errors
remain (`/tmp/notebook-markdown-element-final-types.log`). This is not full type-check success.

### Markdown image loading and native attribute preservation

MarkdownImage now accepts native image props, excluding only the parser node, instead of dropping
everything except src/alt/title. Width/height, srcSet and caller styles survive rendering. Defaults
use loading=lazy and decoding=async; explicit eager/sync choices override those defaults. Browser
native loading owns the viewport policy, so no per-image observer or React loading state is added.

Seven Markdown element/preview tests pass (`/tmp/notebook-markdown-image-tests.log`), including
defaults, metadata preservation, responsive sources, dimensions and explicit policy overrides.
These attribute tests do not measure network scheduling, layout shift or decoded-image memory;
the change does not implement notebook virtualization.

### Stable Markdown CodeMirror configuration

MarkdownCell previously recreated markdown(), syntax highlighting, its extensions array and its
theme on every render, causing the installed react-codemirror wrapper's reconfiguration path to
see changed configuration identities. Static definitions now live in markdownEditorConfig; the
per-cell array is memoized only on its boundary keymap. Different editors still create independent
EditorState instances; only immutable configuration definitions are shared.

Five config/preview tests pass (`/tmp/notebook-markdown-config-tests.log`), verifying same-keymap
array identity, changed-keymap replacement with retained base-extension identities, and independent
documents when sharing those extensions. This removes repeated configuration construction but is
not a measured typing-latency claim or a claim that all CodeMirror wrapper props are now stable.

### Markdown edit queue lifecycle

MarkdownCellViewModel now exposes flushPendingChanges, used on blur, explicit new-Markdown-cell
creation and hook detachment. The hook owns one model per cell ID. External content revisions
received through updateProps cancel older queued text, and structural conversion cancels the
obsolete pending update before publishing its own content. Timer callbacks capture their original
cell ID and decline writes to missing or non-Markdown cells. Four model tests pass
(`/tmp/notebook-markdown-flush-tests.log`): final-input blur/one write, external-prop cancellation,
deleted cells and converted cells. Full route/unmount interaction is not newly browser-verified.

Further inspection found a separate outstanding issue: this secondary editor's handleChange still
splits arbitrary fence-looking lines into executable cells and trims source during conversion.
Its source-edit semantics need to be aligned with the primary editor before claiming full parity.

### Literal source editing does not split notebook structure

The secondary Markdown CodeMirror handler no longer interprets every changed document as an
implicit structural command. The old backwards line scan split complete/incomplete/nested fences
into new executable cells, treated Mermaid as code, trimmed content, and created cells from pasted
heading/newline text. That scan and its now-unused createNewCodeCell helper were removed. Source
typing now queues the exact current-cell text, with unchanged-input no-op handling; explicit
new-cell keyboard actions remain. The primary Tiptap space/Enter fence-confirmation path is
unchanged. This intentionally distinguishes source editing from WYSIWYG insertion gestures.

Five of six new literal-source cases failed before this refactor
(`/tmp/notebook-markdown-source-before.log`). Afterwards, 38 model/shared-preview/primary-fence
tests pass (`/tmp/notebook-markdown-source-final.log`), including whitespace, Mermaid, incomplete
and nested fences, headings and CRLF. The input callback no longer splits/scans/rejoins all lines;
downstream persistence and rendering still have their documented costs. This supersedes the
preceding outstanding auto-splitting note, not the remaining whole-goal verification gaps.

### Markdown hook lifecycle verification

Three new hook tests exercise real React mount/update/cleanup rather than only direct model calls:
switching from cell A to B flushes A under its original ID and creates a separate B model; B's final
input flushes once on unmount; StrictMode effect replay neither publishes empty writes nor loses
final input; deleting the cell before detachment prevents its resurrection. All 13 hook/model
tests pass (`/tmp/notebook-markdown-model-lifecycle.log`). No additional runtime change was needed
for these cases. This verifies React lifecycle ownership but not browser shutdown/crash durability.

### Markdown keyboard composition and commit ordering

The secondary Markdown handler ignores native composition/229 confirmation events and its four
CodeMirror boundary-arrow bindings decline while the view is composing. Ctrl/Cmd+Enter prevents
the default action and flushes pending source before switching edit mode. Ordinary character keys
return before any cell-position lookup; relevant keys reuse the shared index, and removed cells
cannot trigger insertion through this handler. Eighteen model/hook tests pass
(`/tmp/notebook-markdown-keyboard-tests.log`), including commit-before-mode-change ordering,
composition Enter and composing CodeMirror arrows. Actual OS IME candidate behavior still requires
native-browser verification; these synthetic events do not prove every platform input path.

### Secondary title Enter parity

Removed the remaining secondary-editor branch that disabled Enter solely because the title text
equaled '# Untitled'. A new parameterized regression failed for that literal title before removal
(`/tmp/notebook-secondary-title-before.log`). Empty, literal Untitled and ordinary titles now all
create a new Markdown cell with empty content/outputs and focus its new ID, without rewriting the
original title. Primary/secondary title suites pass 24 tests (`/tmp/notebook-title-parity-tests.log`).
Existing stored title text is not silently erased; this is insertion behavior, not data migration.

### Latest full regression after secondary-editor changes

The complete Vitest run now reports 522 passed / 7 failed (529 tests), 75 passed files / one failed
file (76 total), in 74.91 seconds (`/tmp/notebook-latest-full-tests.log`). All seven failures are
still in Workflow action-system.test.ts: its 12-versus-32 registry expectation and unavailable
Jest mocks under Vitest. No newly failing test file appeared in this run. This covers the current
Markdown source/lifecycle/configuration/renderer and drag changes together, but is not a green
full-suite gate, native-browser audit, or completion of the overall optimization objective.

### Bounded Markdown publication during continuous typing

The 300ms source-edit debounce now has maxWait=1000ms so sustained typing does not indefinitely
starve store publication. A failing fake-timer test demonstrates the previous starvation
(`/tmp/notebook-markdown-maxwait-before.log`). Another regression reproduced a preceding local
write's props acknowledgement overwriting newer typing (`/tmp/notebook-markdown-ack-before.log`).
The model now recognizes its most recently published content acknowledgement without replacing
the newer buffer; a different external revision still cancels the old pending edit and resets that
acknowledgement marker. This is local write acknowledgement, not a multiwriter conflict protocol.

The model/hook/autosave suite passes 47 tests (`/tmp/notebook-markdown-maxwait-final.log`). These
verify scheduled store publication and final flush, not a one-second disk durability guarantee:
the downstream persistence queue and browser timer throttling remain separate concerns.

### Commit before cross-cell navigation

Markdown navigation now flushes pending source before delegating to the shared navigation path,
rather than relying on a later blur. The base navigation method also declines when its source ID
is absent from the current view; previously index -1 plus a down step incorrectly focused index 0.
Both regressions failed before the changes (`/tmp/notebook-markdown-navigation-before.log`).
Thirty-six Markdown model/hook and Hybrid model tests pass afterwards
(`/tmp/notebook-markdown-navigation-final.log`), including update-before-focus ordering and no
second delayed write. This is store publication ordering, not synchronous disk persistence.

### Canonical view queries avoid repeated output projection

getCurrentViewCells and getAllCellsBeforeCurrent no longer clone every returned cell and remap
already-normalized outputs. Publication owns normalization; read paths reuse immutable canonical
cells. The obsolete deserializeOutput helper was removed. Existing consumers were inspected and
use returned data for rendering, navigation or payload construction, not in-place mutation.
Create-mode view lookup now returns the current array directly; prefix queries still allocate
their required slice. Shared cell navigation uses the existing weak ID index, so repeated lookups
on the same immutable array reuse it. Phase/step selection retains its existing filtering costs.

The new identity test failed before (`/tmp/notebook-view-query-before.log`); 46 store identity,
output, Markdown navigation and index tests pass after (`/tmp/notebook-view-query-final.log`).
The test confirms normalized output content remains unchanged and object/array references are
reused. This is allocation/query evidence, not a new browser latency or persistence benchmark.

### Global shortcut ownership

Notebook shortcuts now share an ownership guard for editable surfaces, dialogs, composition
and already-consumed events. Step navigation only consumes its keys in step mode; mode toggling
requires the actual Ctrl+Alt modifier chord rather than arbitrary characters or repeats held
with those modifiers. Create-mode arrow navigation reuses the shared cell ID index.

The combined shortcut/store/Markdown model/hook run passes 52 tests
(`/tmp/notebook-current-final-tests.log`). An additional source-arrow ownership regression brings
the shortcut-only suite to eight passing tests (`/tmp/notebook-shortcuts-final.log`). These are
DOM keyboard regressions, not native OS IME or keyboard-layout certification.

### Drag completion consumes active ownership

The sortable owner now tracks the active drag synchronously as well as its rendered overlay.
Completion consumes ownership before publishing order, preventing duplicate end callbacks from
publishing twice. Cancellation, removal and unmount terminate ownership; restoring a removed
cell does not resurrect its drag. Events for a different cell cannot clear the current drag.
The additional ownership state is O(1); lookup continues to reuse the shared immutable-array
index and an actual reorder still copies the array in O(n).

The duplicate-end regression failed before this change (`/tmp/notebook-drag-consume-before.log`).
The five drag tests plus shared-index test pass (`/tmp/notebook-drag-consume-final.log`). These
mock sensor callbacks and do not establish native pointer/keyboard sensor correctness or
distinguish delayed events from separate drags of the same cell ID.

### Fence conversion respects composition ownership

The nested-fence conversion entry point now declines while the ProseMirror view is composing
or the editor has been destroyed. Converting the owner cell during composition would detach
the input DOM. A direct-command regression failed before the guard
(`/tmp/notebook-fence-composition-before.log`), then passed with normal conversion still enabled
after composition ends. The source-transition and fence-input suites pass 74 tests
(`/tmp/notebook-fence-composition-final.log`), including existing repair, undo and nested-container
coverage. The new test simulates the view's composition state; native OS IME remains unverified.

### Source NodeView callback ownership

Markdown source editing, history commands, preview and deferred focus now validate that the
current position still contains the same source-cell ID in an editable, live editor. A stale
NodeView callback cannot write into or preview a replacement cell. The textarea tracks its own
composition lifecycle (separate from ProseMirror's contenteditable composition), keeping source
mounted if Preview is invoked before composition ends. Source changes still publish normally.

Four NodeView regressions cover composition, replacement, destruction and read-only transitions.
Together with source input/history tests, 14 tests pass (`/tmp/notebook-source-owner-final.log`).
This covers synthetic DOM events; native IME focus/blur ordering still needs browser validation.

### Mermaid composition-safe preview switching

Mermaid source now retains its textarea when Preview is invoked during composition; editing
continues publishing code and preview becomes available after composition ends. Source changes
and preview switching also decline after editor destruction. This uses the textarea's own
composition lifecycle, not the unrelated ProseMirror composition flag. The new regression failed
before (`/tmp/notebook-mermaid-composition-before.log`); Mermaid controls, preview and Markdown
source suites pass 19 tests (`/tmp/notebook-mermaid-composition-final.log`). Native IME event
ordering and Mermaid NodeView replacement ownership are not proved by these tests.

### Mermaid source revision ownership

Nested Mermaid nodes do not carry independent cell IDs. Source writes and history shortcuts now
require that getPos resolves to the exact immutable node rendered by the input, in a live editable
editor. This prevents an input based on a replaced revision from overwriting the replacement.
The regression fails before the guard (`/tmp/notebook-mermaid-owner-before.log`), then verifies
that rerendering with the new node permits editing again. The two source NodeView suites pass
12 tests (`/tmp/notebook-mermaid-owner-final.log`). Actual ReactNodeView publication timing under
rapid native input remains a browser-validation requirement; these tests use mocked NodeViews.

### Browser verification of Mermaid revision guard and composition

The isolated Chromium profile on CDP 9225 exercised the actual ReactNodeView against the running
Vite application after the revision guard change. `/tmp/notebook-mermaid-insertion-browser.mjs`
now types the Mermaid fence and diagram source character-by-character, including Chinese labels,
checks exact textarea content and original store cell identity, then waits for an SVG. It returns
to source, appends another edge, starts Chromium composition with Input.imeSetComposition,
attempts Preview while composing, commits the text, and verifies exact final content, store
publication and the next SVG preview. Both stages passed; this establishes browser-level
continuous editing and preview round-trip behavior, not native macOS IME certification.

### Source paste history boundaries

Notebook source input now isolates paste, drop and replacement-text input operations in the
existing incremental history. Previously all input was tagged as continuous typing, so a single
undo could remove typing before a paste, the paste itself and following typing together. The
paste regression fails before (`/tmp/notebook-paste-before.log`); the dialog and draft history
suites pass 29 tests after (`/tmp/notebook-paste-final.log`). The regression checks three successive
undo operations against exact draft text. Ordinary textarea changes still require a prefix/suffix
diff; this is an undo-semantics correction, not removal of that O(n) scan.

### Comprehensive validation after source/diagram lifecycle changes

The full current suite reports 545 passing tests and seven failures across 78 files
(`/tmp/notebook-comprehensive-current-tests.log`). All failures remain in the unchanged Workflow
action-system test: the 12-versus-32 registration expectation and missing jest globals in Vitest.
Production build passes (`/tmp/notebook-comprehensive-current-build.log`); NotebookApp remains
2,736.81 kB minified, 899.28 kB gzip, with large-chunk warnings.

Type checking initially exposed six additional diagnostics from recent edits. These were fixed:
the lodash-es ambient declaration cannot supply DebouncedFunc, so the local deferred writer uses
its explicit callable/flush/cancel contract; the test no longer requires Array.at beyond the
configured library target; Mermaid test doubles use explicit unknown casts without duplicate
state initialization. Type checking returns to 308 diagnostics
(`/tmp/notebook-comprehensive-final-types.log`), not a green type gate. The three affected suites
pass 32 tests after these fixes (`/tmp/notebook-comprehensive-fixed-tests.log`).

### Full-source composition ownership

The notebook source dialog tracks its textarea composition lifecycle. Toolbar history, cell
insertion, Apply and native dialog cancellation decline while composition owns the buffer;
keyboard/native history handlers also check that lifecycle in addition to event flags. Explicit
Cancel remains an intentional discard action. A regression reproduced toolbar Undo changing a
composing draft (`/tmp/notebook-dialog-composition-before.log`). The updated test verifies Undo,
Add and Apply leave the composing draft/live cells unchanged, then Apply succeeds after composition
ends. Dialog/history suites pass 30 tests (`/tmp/notebook-dialog-composition-final.log`). Native
OS input-method ordering remains outside this synthetic-event coverage.

### Fence-break boundary matrix

Six added source-transition cases cover empty backtick and tilde blocks, long opening/closing
delimiters with info text, unknown languages with Chinese/emoji content, and empty quoted/list
code blocks. Each selects the code start, breaks one opening delimiter, repairs at the returned
caret and previews again. Exact projected cells match the original; neighbor node references
remain untouched. All 55 source-transition tests pass (`/tmp/notebook-fence-edge-tests.log`).
These are real ProseMirror document transformations in the test environment, not native browser
Backspace tests or measurements of large-document typing latency.

### Browser Backspace / repair and empty quote serialization

`/tmp/notebook-fence-browser.mjs` uses Chromium Input.dispatchKeyEvent for Backspace at the actual
nested code start, checks the source textarea receives focus and its caret follows the shortened
delimiter, inserts the missing delimiter through Input.insertText, previews and compares store
content/IDs. Both a nonempty tilde block and empty quoted backtick block now pass.

The browser check initially caught an extra trailing space on an empty quote line. Shared
blockquote serialization now emits `>` for an empty line instead of `> `; nonempty lines are
unchanged. A focused serializer regression and the source-transition suite pass 56 tests
(`/tmp/notebook-fence-browser-regression.log`). The browser needed a full reload to replace the
existing editor's old serializer closure after HMR; the fresh-editor run passes both fixtures.

### Mixed-source preview language consistency

A stronger hybrid round-trip assertion exposed that a TypeScript hybrid restored an executable
node with Python language even though reconciliation preserved TypeScript store metadata.
Preview was asking for a standalone fence, which cannot match mixed prose/code source.
The shared firstExecutableFence selector now serves hybrid content projection, source entry /
fence deletion and preview language selection, always skipping Mermaid. It stops on the first
matching complete fence and adds no extra whole-document projection or cache.

The node-language assertion fails before (`/tmp/notebook-hybrid-language-before.log`); 67 source
transition and hybrid model tests pass after (`/tmp/notebook-hybrid-language-shared-final.log`).
Store-owned language metadata policy for hybrids is unchanged by this correction.

### Executable-fence selector bounds and edge cases

Direct selector tests cover case-normalized Mermaid exclusion, CRLF offsets, multiple code
blocks, unknown/incomplete candidate ownership and diagram-only/prose-only documents. A counted
line iterator verifies selection stops after six lines when the first executable fence follows
a diagram, despite 10,000 trailing prose lines. This demonstrates lazy early termination, not
constant worst-case cost: a document with no executable fence still requires O(n) scanning.
Scanner and hybrid-model suites pass 37 tests (`/tmp/notebook-fence-selector-tests.log`).

### Deleted hybrid edit ownership

Hybrid editing now requires the cell to still exist as a hybrid in the current store snapshot.
Previously a missing cell caused the callback to continue from its stale model and call updateCell.
The removed-cell regression fails before (`/tmp/notebook-hybrid-delete-before.log`). Test fixtures
now register live cells explicitly, so edit tests exercise the real store ownership contract;
model/hook suites pass 13 tests (`/tmp/notebook-hybrid-delete-final.log`). This avoids stale writes
at their source without adding a second lookup or changing the store's missing-ID behavior.

### Hybrid editing surface transitions

The hybrid edit guard is now symmetric: both disappearance and appearance of the editable code
fence invalidate a callback from the previous editing surface. Previously a stale full-Markdown
buffer could replace newly introduced code as if it were a CodeMirror payload. The new regression
fails before (`/tmp/notebook-hybrid-surface-before.log`); model/hook tests pass 14 tests after
(`/tmp/notebook-hybrid-surface-final.log`). Surrounding-text updates with the same code surface
retain the existing merge behavior. Concurrent edits to the code body itself still require a
separate revision/conflict policy; this guard does not claim multiwriter conflict safety.

### Mermaid configuration reuse

The serialized render service initializes Mermaid only when its theme changes. Repository search
confirmed it is the sole production Mermaid caller; inspection of the installed mermaid.core.mjs
confirmed per-diagram processAndSetConfigs resets diagram configuration before applying directives.
The service retains only the configured theme, invalidates it before initialization and records it
only after successful initialization. Thus a thrown initialization remains retryable.

The new same-theme initialization-count regression fails before
(`/tmp/notebook-mermaid-config-before.log`); scheduler and preview suites pass 13 tests afterwards
(`/tmp/notebook-mermaid-config-final.log`), including initialization failure/retry. Initialization
cost becomes proportional to theme transitions rather than rendered diagrams, with O(1) added
state. This does not reduce the cost of SVG layout itself or establish a browser latency gain.

### Real-renderer configuration isolation

An isolated Chromium run of `/tmp/notebook-mermaid-config-browser.mjs` exercised the actual
Mermaid renderer through MermaidRenderService: a source-level custom primary color appears in
its SVG but not the following ordinary diagram; dark and light transitions render successfully;
an invalid diagram rejects and the next valid diagram renders. Initialization occurs exactly
three times (initial light, dark, restored light), not for every request. This verifies per-diagram
configuration isolation for the tested directive and error recovery with the installed renderer.
It is not an exhaustive directive matrix or a measured rendering-speed benchmark.

### Visibility subscription ownership

Shared preview observation now assigns each registration an identity and only lets its own
cleanup remove that registration. Repeated cleanup after re-subscription previously removed the
new listener and unobserved its element, preventing preview visibility updates. The regression
fails before (`/tmp/notebook-observer-before.log`); visibility and Mermaid preview suites pass
10 tests after (`/tmp/notebook-observer-final.log`). The existing 1,000-preview test still verifies
a single observer and final disconnection. Registry lookup/removal remains O(1) with O(n) active
subscription storage, without extra observers or per-preview timers.

### Observer generation isolation

Visibility callbacks now verify they belong to the currently active observer instance before
dispatching queued entries. A disconnected observer's delayed callback could previously notify
a new subscription on the same element. The generation regression fails before
(`/tmp/notebook-observer-generation-before.log`); visibility, Mermaid preview and code activation
suites pass 20 tests after (`/tmp/notebook-observer-generation-final.log`). This adds one identity
comparison per delivered batch and no new observer or per-element generation registry.

### Suspended code geometry

CodeEditorSession no longer replaces its last positive measured height with zero when an
ancestor is hidden. An initially unmeasurable editor leaves height undefined, allowing the
existing placeholder default, while compact positive measurements remain exact. The new
regression fails before (`/tmp/notebook-code-height-before.log`); session and activation suites
pass 13 tests after (`/tmp/notebook-code-height-final.log`). This prevents zero-height placeholder
state; native scrolling layout still needs broader visual validation.

### Shared contiguous text replacement

SourceDraftHistory and suspended CodeEditorSession now use one textReplacement utility instead
of separate prefix/suffix scans. Offsets explicitly use UTF-16, matching textarea and CodeMirror;
the replacement reconstructs exact text even with mixed line endings and lone surrogate units.
Both callers retain their own history/selection ownership and unchanged-text fast paths.
The utility performs O(n) comparisons and creates only the inserted slice plus a constant-size
descriptor, not a full edit matrix. This consolidates logic; it does not remove the full scan.
Utility, source history and suspended-session suites pass 10 tests
(`/tmp/notebook-shared-text-diff.log`), including reconstruction across 121 buffer pairs.

### Text-diff integration verification

Document synchronization retains its node-level diff rather than being forced through the
string replacement utility: node structure and selection mapping are different semantics.
The combined document sync, source apply, draft history, suspended session and text replacement
suites pass 40 tests (`/tmp/notebook-diff-integration-tests.log`). Type checking caught two new
incomplete IntersectionObserverEntry test casts; fixtures now construct complete entries instead.
The visibility suite passes three tests after that correction
(`/tmp/notebook-observer-typed-tests.log`).

### Open source draft read-only transitions

The source dialog now shares a live editability predicate across textarea input, native
beforeinput, history/indent shortcuts and add/history toolbar actions. Previously only Apply
blocked revoked access, while the open draft remained editable. Read-only transitions now freeze
the buffer without discarding its draft or history; restored access permits editing again.
The regression fails before (`/tmp/notebook-source-readonly-before.log`), and all 27 source dialog
tests pass afterwards (`/tmp/notebook-source-readonly-final.log`). Cancel remains available.

### Draft reattachment ownership

Registry attachment no longer replaces an existing notebook draft or reattaches a closed session.
An open draft detached during effect replay can still reattach when the slot is vacant. Two
ownership/replay regressions fail before (`/tmp/notebook-draft-owner-before.log`); registry and
source dialog suites pass 31 tests after (`/tmp/notebook-draft-owner-final.log`). All registry
operations remain constant-time map operations. Unapplied named drafts still intentionally
remain in application memory; durable draft storage and bounded retention are unresolved.

### Source identity index reuse

NotebookSourceDocument now owns one ID-to-entry index, replacing its ID Set and the freshly
allocated baseline Map on every reconcile. Appending extends the same index; entries beyond
the original baseline length remain draft-created cells rather than baseline conflict targets.
Reconcile avoids one O(n) index rebuild/allocation, while decoding and conflict checks remain
linear. Source document/session/registry suites pass 23 tests
(`/tmp/notebook-source-position-index.log`). The original cell references still intentionally
preserve decode output/metadata identity, so this does not solve old output snapshot retention.

### Validation without source-cell materialization

Appending a source cell now runs the shared boundary visitor in validation-only mode, instead
of decoding an entire cell array and discarding it. Decode uses the same visitor with its cell
materialization callback. Validation skips body slicing, edited-cell cloning and output/metadata
access, while retaining duplicate-boundary detection and validation before identity allocation.
The new test uses a throwing output getter on an edited code cell and confirms append succeeds
without touching it; malformed boundaries still reject without consuming the next entry index.
Document/session suites pass 20 tests (`/tmp/notebook-source-validation-tests-final.log`). Boundary
scanning and the seen-index Set remain O(n); this removes transient cell-array work, not all
linear validation cost.

### Cleared diagram source releases derived state

MermaidPreview now clears retained SVG/error state when source becomes empty or whitespace-only,
including while the component remains visible. Previously the old SVG string and its source key
remained cached invisibly until another render or offscreen reclamation. The regression fails
before (`/tmp/notebook-mermaid-empty-before.log`) and verifies that restoring source requests a
fresh render rather than reusing retained state. Preview/scheduler suites pass 14 tests after
(`/tmp/notebook-mermaid-empty-final.log`). This verifies state lifetime, not measured heap recovery.

### Suspended-source shrinking and selection mapping

Three additional session tests restore a folded document with multiple selections after external
content shrinks to empty, short Chinese text or short multiline text. Restored documents match
exactly, every selection stays within bounds, no external change enters undo history, and another
restore with unchanged text reuses the serialized snapshot. Session/activation suites pass 16
tests (`/tmp/notebook-suspended-selection-tests.log`). These cases establish bounded selection
mapping, not general concurrent-edit merging or preservation of all histories under disjoint
external changes represented as one contiguous replacement.

### Exclusive source publication state

NotebookSourceSession now transitions through applying while invoking its synchronous publisher.
Reentrant edit, cancel and apply are rejected during that interval; success becomes applied and
exceptions become conflicted for retry. The registry retains the current owner during applying
rather than opening a second draft. The reentrancy regression fails before
(`/tmp/notebook-source-applying-before.log`); session/registry/dialog tests pass 38 tests after the
session change, and the final owner/session suite passes 12 tests including publication ownership
(`/tmp/notebook-source-applying-owner-final.log`). This enforces synchronous ownership, not
transactional rollback of side effects from a publisher that mutates and then throws.

### No-op source publication

The actual applyNotebookSource boundary now returns after access checks when before/after contain
the same immutable cells in the same order. Previously even this no-op built indexes/projected
the document, dispatched transactions and created a source-history step. The regression fails
before (`/tmp/notebook-apply-noop-before.log`) and now verifies zero dispatch and no undo entry.
Publisher/dialog suites pass 32 tests (`/tmp/notebook-apply-noop-final.log`). The guard is O(n)
identity comparison with constant auxiliary space; changed and reordered documents still use
the existing range-based apply path.

### Source publisher reuses immutable-cell indexes

applyNotebookSource now uses the shared weak-key ID index to identify changed before/after cells
instead of allocating two private Maps and intermediate tuple arrays for each apply. The shared
index is built once per immutable cell-array identity and reused by existing consumers; obsolete
arrays remain weakly held. Change filtering is still O(n), with O(n) indexing on a cold snapshot.
Publisher and index suites pass six tests (`/tmp/notebook-apply-shared-index.log`), including
1,000-cell changed-run projection, undo and runtime-data restoration. No browser speedup is
claimed from this allocation-path change alone.

### Known-range ordinary source input

Cancelable non-composing insertText beforeinput now records its explicit selection replacement
directly in SourceDraftHistory and updates that textarea range with setRangeText. It does not
call full-buffer edit/diff. Known-range history supports non-isolated typing, preserving normal
typing groups while existing command replacements remain isolated. Composition, paste and
non-cancelable events retain their native event paths; their observed changes still use diffing.

The new selection-replacement/typing/undo test fails before
(`/tmp/notebook-source-input-range-before.log`); dialog/history suites pass 32 tests after
(`/tmp/notebook-source-input-range-final.log`). The isolated Chromium source-history script also
passes typing undo/redo, backward selection, indent/add undo and route draft/history recovery.
This eliminates ordinary typing's prefix/suffix scan, not all O(n) work: full source strings and
React/textarea publication remain, so end-to-end constant-time typing is not claimed.

### Known-range source line breaks

Cancelable insertLineBreak/insertParagraph now use the same selected-range insertion path as
ordinary source typing, inserting LF without full-buffer diffing. Two regressions fail before
(`/tmp/notebook-source-linebreak-before.log`) and verify exact source, caret and undo afterward.
Additional tests confirm non-cancelable and composing insertText are untouched. Dialog/history
suites pass 36 tests (`/tmp/notebook-source-linebreak-final.log`). Native browser Enter behavior
has not yet been rerun specifically for this extension of the input path.

### Native source Enter verification

The isolated Chromium source-history script now sends actual Enter keydown/up with native text
input, checks exactly one inserted LF and the following caret position, then verifies undo and
redo before continuing the existing typing/indent/add/route-recovery scenarios. The complete
script passes (`/tmp/notebook-source-history-browser.mjs`), including unchanged live notebook
content until Apply. This closes the Chromium Enter verification gap above; other browser
engines and native OS input methods remain separate validation scopes.

### Known-range selected deletion

Cancelable backward/forward deletion and cut with a nonempty textarea selection use explicit
range replacement, avoiding full-buffer diffing. Cut is isolated in history; backward selections
restore on undo. Collapsed deletion is deliberately left to the browser's Unicode/grapheme
boundary handling. Three selected-deletion regressions fail before
(`/tmp/notebook-source-selection-delete-before.log`); dialog/history suites pass 41 tests with
collapsed-deletion guards (`/tmp/notebook-source-selection-delete-guard-final.log`). Native
clipboard and selected-delete browser behavior remain to be checked separately.

### Native selected-delete verification

The isolated Chromium source-history script now selects code backwards and sends actual
Backspace and Delete keydown/up events separately. Each removes exactly the selected text;
undo restores both text and backward selection, redo removes it again. The full subsequent
Enter, typing, indentation, cell-addition and route-recovery sequence also passes
(`/tmp/notebook-source-history-browser.mjs`). No system clipboard was read or written; native
cut/paste remains unverified by this run.

### Source input adaptation boundary

The browser-event-to-range mapping now lives in sourceInputChange rather than nested modal
conditions. It is a pure adapter with no DOM/store access, returning offsets, normalized insert,
caret and history-isolation intent only when the range is fully known. The dialog owns access,
composition lifecycle, history application and DOM publication. Twelve adapter tests cover UTF-16
offsets, newlines, selected deletion and explicitly declined native events; adapter/dialog suites
pass 49 tests (`/tmp/notebook-source-input-adapter.log`). This is a responsibility refactor with
the prior input behavior preserved, not a new asymptotic speedup.

### Latest full integration gates

After the accumulated known-range input, draft lifecycle, shared-index and preview changes,
the complete suite reports 601 passing / seven failing tests across 80 files
(`/tmp/notebook-current-all-tests.log`). The seven failures remain in the unchanged Workflow
action-system suite (registration count expectation and missing jest globals). Production build
passes (`/tmp/notebook-current-production-build.log`) with large-chunk warnings. A new test getter
type diagnostic was corrected with its explicit never return; type checking returns to 308
diagnostics (`/tmp/notebook-current-fixed-typecheck.log`), not a passing type gate.
These results do not close the remaining architecture gaps listed in the completion audit.

### Shared Markdown preview dialect

Hybrid prose now uses the same GFM, math, complete-Mermaid and KaTeX plugin configuration
as Markdown cells, extracted into `markdownPreviewPlugins.ts`. Existing content-based memoization
is retained; this is rendering parity, not a claim of a new asymptotic improvement. A regression
first failed with zero rendered formulas, then passed with inline/display math while inline code
and Python fences remained literal. The HybridMarkdown suite passes all 11 cases, including
complete/incomplete Mermaid and retained diagram lifecycle. No native-browser math visual audit
or full integration rerun was performed for this incremental change.

### Source selection deletion undo boundary

An adjacent typed character followed by selecting/deleting it previously merged into one history
event, so Undo failed to restore the deleted character. The regression failed before the fix.
SourceDraftHistory now classifies removals as deletion and isolates explicit selection removals
on both sides, preserving separate undo/redo for preceding and following typing. Collapsed native
deletion remains eligible for grouping. Installed CodeMirror already trims history event counts;
this does not establish a byte-level memory bound for large edits or retained notebook drafts.

Typing/deletion transitions now also start a new history group. Changing the user-event annotation
alone is insufficient: CodeMirror's default join predicate merges adjacent changes across those
categories. SourceDraftHistory tracks the previous category in constant space and applies a
before-boundary on a category change, leaving consecutive deletions groupable. Explicit isolated
commands and successful undo/redo reset that category. A regression reproduces typing `bc`,
backspacing twice, then typing `xy`, and verifies three distinct undo and redo groups; it failed
before adding the boundary. This changes grouping semantics, not the full-buffer edit complexity.

### Mermaid cancellation failure verification

Two additional scheduling regressions verify that a pre-aborted request never loads Mermaid,
and that an already-running render which rejects after cancellation does not poison the queue.
The cancelled caller resolves immediately; the next theme's render waits for the original
library call to settle, then succeeds. Service and preview suites pass 16 tests
(`/tmp/notebook-mermaid-late-failure.log`). Existing implementation passes unchanged. This
confirms late-failure handling, not interruption of Mermaid work: a library call that never
settles still blocks the serialized queue, and forcibly overlapping renders would violate
global configuration ownership. No timeout or worker isolation has been implemented here.

### Code editor DOM selection pinning

Offscreen code editors now remain mounted when a non-collapsed DOM selection intersects their
container, including ranges whose endpoints are both outside it. Previously only focus, IME,
immediate activation and pending navigation pinned them; the new external-range regression failed
before the fix. Active editors listen for selection changes so clearing the selection resumes
the 500 ms eviction delay, and a selection created during a pending eviction cancels it.
Deferred/suspended placeholders do not install these listeners. This preserves selection ownership
without polling or scanning all notebook cells; selection events visit active subscribers, so
cost remains proportional to mounted editors. Browser-native cross-cell copying is not yet audited.

### Integration type audit and obsolete cell manager removal

The post-selection/math/history type check still reported the same 308 diagnostics as the prior
baseline; the only diagnostic diff was shifted MarkdownCell line numbers. Repository-wide reference
inspection found `CellManagement/useCellManager.ts` had no consumers or re-exports; the active TipTap
editor uses `TipTap/hooks/useCellManagement.ts`. Removed the unused legacy hook rather than patching
its untyped duplicate insertion/movement/deletion logic. The removed tracked file had no local edits
before removal and remains recoverable from Git. This cleanup does not claim a runtime speedup.

### Active cell creation defaults

The active TipTap cell management hook now routes its five public creation methods through one
typed creation path. Code and hybrid cells explicitly persist `language: 'python'`; previously
both omitted it. A five-case regression first failed those two cases, then passed all five,
including unchanged existing cell references and editability defaults. Public method signatures
remain unchanged. Immutable append still copies the cell array in O(n); this refactor does not
claim O(1) insertion or solve repeated calls against a stale React render snapshot.

The subsequent burst-creation regression demonstrated loss of the first cell when two creation
methods ran before a React render. The internal hook now receives a current-snapshot getter,
with the TipTap host supplying a stable store getter; each synchronous append reads authoritative
cells immediately before publishing. The hook's internal dependency contract and its sole caller
were migrated together, without a legacy snapshot fallback. Public editor creation methods are
unchanged. Array copying remains O(n); this fixes lost updates and removes the callbacks'
dependency on every cells-array revision, not persistent-vector insertion complexity.

### Store insertion language ownership

The store's separate `addCell` path constructed a new cell without copying its language, losing
even an explicitly supplied TypeScript/JavaScript value. It now uses the shared language normalizer
for code/hybrid insertion: omitted language defaults to Python, aliases normalize, and unknown
languages remain preserved. Five regression cases all failed before the fix, covering these
behaviors and preservation of the existing title-cell reference. This does not change the kernel's
Python-only execution capability or reinterpret non-code cells.

### Default-title replacement selection identity

Replacing a default title retained the old cell ID in the array but selected the incoming,
discarded ID. The insertion path now normalizes its local cell ID before publication and
selection so both refer to the retained cell. The caller's input object remains unchanged.
The regression failed on currentCellId before the fix and now passes with the full 26-case
store identity suite (`/tmp/notebook-title-identity-final.log`). Existing title recognition
policy is unchanged; this addresses selection identity rather than heading-style rendering.

Title recognition was then corrected separately: insertion now uses the same block lexer as
the Markdown structure index and requires a leading top-level H1. H2, hashtags and indented
code no longer replace the default title; quoted/fenced headings remain content. Setext H1
is recognized consistently with document structure parsing. Six cases produced four failures
before the fix. The parse result is reused for both empty-notebook initialization and title
replacement; parsing is O(source length), not a constant-time prefix check.

Title recognition is now lazy within insertion: only empty-notebook initialization or a candidate
default-title replacement invokes it. Ordinary append, including after a default title plus body,
does not allocate a second Markdown token tree solely for title recognition. A per-insertion
boolean caches either result when both branches need it. Two call-count regressions failed before
this change; the identity and structure suites now pass 43 tests. Task derivation still performs
its required structure work; this removes redundant parsing, not all insertion-time parsing.

### Creation wrapper identity ownership

The end/next creation wrappers overwrote addCell's corrected current ID with the discarded incoming
ID during default-title replacement. Both regressions failed before the fix. addCell now returns
the actual published ID (an additive return value for existing callers that ignore it), and all
three creation wrappers use that identity for tracking/editing and applicable return values.
Selection remains owned by addCell instead of being redundantly overwritten afterward. The store
identity suite passes 36 cases; no full type/build rerun has yet covered this API refinement.

The follow-up type audit found one new test-only Array.at incompatibility with the configured
target; indexed access fixes it and the diagnostic count returns to 307. addCell's phase repair
now performs one early-exit nested search instead of up to two flatMap/find passes, removing
O(number of phases) temporary arrays while keeping O(number of phases) worst-case search.
Regression coverage includes missing/current phase selection and step-index clamping. The fixture's
first phase belongs to the title cell, so fallback assertions use that existing parser policy.

The workflow ScriptStore also returned/tracked its preallocated ID after title replacement.
It now consumes addCell's actual published ID for its return value, tracking and log entry.
A cross-store regression failed before this migration and verifies that a subsequent update
using the returned ID reaches the retained title. This closes that consumer's stale-identity
path without introducing a second ID lookup or a compatibility fallback.

### Refreshed full-suite verification

After the accumulated preview, history, selection, insertion and title changes, the full suite
reports 634 passing and seven failing tests across 82 files (81 passing files), in 46.02 seconds
(`/tmp/notebook-integration-refresh.log`). All seven failures are still the action-system suite's
outdated 12-versus-32 registration expectation and Jest globals unavailable in Vitest. Logs also
contain caught IndexedDB-unavailable errors in the test environment; passing tests alone do not
verify browser persistence. The full type check reports 307 diagnostics
(`/tmp/notebook-integration-refresh-types.log`), exit 2. No production build was run in this gate.
These checks do not establish completion of the remaining architecture and native-browser gaps.

### Workflow test runner migration

The seven persistent action-system failures are repaired in the test suite: explicit Vitest imports
replace Jest globals, and registration now asserts the exact 32-name protocol inventory verified
against registerAction calls, including aliases, rather than an obsolete count of 12. All 15
action-system cases pass (`/tmp/notebook-action-gate.log`), including creation, execution dispatch
and title updates. Production action behavior was not changed for this migration. The complete
suite has not yet been rerun after it; its prior 634/7 result is not retroactively labeled green.

### Production build and contention-sensitive integration run

The subsequent full run, concurrent with a production build, reports 634 passing / seven failing
tests across 82 files (`/tmp/notebook-full-green-check.log`). These are NOT the old workflow
failures: all seven are timeouts in five large-document suites. Production build passes in 4m33s
(`/tmp/notebook-production-refresh.log`), with NotebookApp at 2738.42 kB minified / 899.94 kB gzip
and large-chunk warnings. After that build finished, rerunning the five affected suites with
`--maxWorkers=1` and unchanged test timeouts passes all 95 tests in 108.24s
(`/tmp/notebook-large-isolated-check.log`). This supports resource contention as a contributing
factor, but does not prove a full-suite green run or acceptable interactive latency. All launched
processes for this verification completed; no background build/test remains from it.

### Deferred file-source highlighting

Both preview hosts previously imported the full Prism-based syntax highlighter and code viewer
eagerly. Their code viewers and shared HTML source highlighter now use the existing lazy preview
boundary; theme and custom layout props remain unchanged. Source imports confirm no remaining
eager highlighter consumer outside those deferred modules. Preview lifecycle tests pass all three
cases, including a table preview that does not load highlighting and an HTML source request that
loads only its highlighter. Type checking remains at 307 diagnostics with none in the changed
preview modules (`/tmp/notebook-highlight-types.log`). Actual production chunk-size improvement
has not yet been measured; this is an import-boundary change, not a claimed byte reduction.

### Measured highlighting split

The standalone production build passes in 1m50s (`/tmp/notebook-highlight-build.log`). NotebookApp
decreases from 2738.42 to 2098.35 kB minified and from 899.94 to 668.80 kB gzip: 640.07 kB minified
and 231.14 kB gzip moved off that entry chunk. HighlightedSource and CodeDisplay load the shared
`tomorrow-Cm_NbS3n.js` chunk. Parsing built ESM imports with es-module-lexer and traversing all
ten static JS modules reachable from NotebookApp confirms that shared highlighter is not eagerly
reachable. This is deferred transfer/parse work, not removal of the dependency or a measured
end-to-end startup-latency improvement. Large-chunk warnings remain.

Real (unmocked) highlighter rendering is now covered by two tests
(`/tmp/notebook-highlight-render.log`): HTML containing script syntax, entities, Chinese text and
emoji remains literal code without script DOM creation; theme changes preserve text, padding and
height while changing the default background. These supplement lazy-loader tests, which mock
the imported module, but are still DOM tests rather than a browser screenshot/layout audit.

### File Markdown preview source fidelity

CodeDisplay's Markdown preview still rewrote every single newline as two spaces plus newline,
including inside code fences. It now consumes original content and shares the editor's Markdown
plugins, complete-Mermaid preview and prose soft-line components. This removes the extra O(source
length) rewrite and derived string while preserving prose layout. Two regressions failed before
the fix: exact Python fence text and complete/damaged Mermaid transitions. Those and shared
code-preview tests pass five cases (`/tmp/notebook-file-markdown-final.log`). Mermaid rendering
itself is mocked in the new integration tests; the existing render-service tests cover that layer.

CodeDisplay's private language whitelist also discarded supported TypeScript syntax. It now uses
the shared language normalizer, retaining explicit grammar names and normalizing aliases/case;
unspecified file language remains plain text rather than assuming Python. Three TypeScript
component cases failed before the change and all five CodeDisplay cases now pass. This is only
the rendering layer: storage FileType and preview-host routing still lack a TypeScript branch,
so direct `.ts` file preview is not yet claimed complete.

TypeScript routing is now wired through FileType, getFileType, getActivePreviewMode and both
preview hosts. Their duplicated extension checks were removed in favor of getPreviewFileType:
known extensions select the renderer, unknown/extensionless names retain the declared type.
`.ts`/`.d.ts`/uppercase `.TS` map to TypeScript code preview; `.tsx` retains the existing JSX
sandbox route. File-routing and actual CodeDisplay tests pass 14 cases; type checking remains
at 307 diagnostics with none in the changed routing modules. Browser file-open interaction and
cached-file reload have not yet been exercised for this change.

File/MIME detection now shares basename-only extension extraction using lastIndexOf instead of
split arrays. Bare names such as `ts`/`json` and hidden `.ts` no longer invent extensions; directory
dots and Windows separators are handled consistently. Eight additional cases exposed three
failures before correction, and all 17 routing tests pass afterward. Path scanning remains O(path
length), with no intermediate arrays and only the extension substring retained.

### Source selection overwrite undo

Source history now isolates typing over an explicit selection as well as deleting it. A native
diff may retain a common prefix/suffix, so containment within the selected range is recognized
instead of requiring identical ranges. Regression tests cover typing on both sides, backward
selection restoration and trimmed native diffs. The dialog's prior test assumed selection
replacement and subsequent typing shared one undo; it now asserts both separate undo steps.
No new buffer scan is introduced by this grouping change.

Explicit caret/selection movement now isolates the previous history group without adding a
document undo event. Previously adjacent typing after a caret move could merge with the earlier
typing; a regression reproduced it. Unchanged selection notifications still return immediately,
so continuous typing remains grouped. History/dialog suites pass 46 cases; an additional no-op
selection test passes with all ten history cases. No full-buffer scan or extra text snapshot is
introduced, and this has not yet been rechecked with native browser selection events.

### Source node revision ownership

MarkdownSourceCellView now checks the actual immutable document node, not just cell ID/type,
before accepting source writes, history commands or preview transitions. A same-ID external
revision made the old callback overwrite new source; that regression failed before the change.
Rendering the new revision re-enables editing. Six node-view and nine source-input history tests
pass (`/tmp/notebook-source-revision-final.log`). After an interrupted turn, the completed log
was inspected rather than restarting that test process.

An isolated headless Chromium run then passed `/tmp/notebook-fence-browser.mjs` against the
current dev server: native Backspace breaks a tilde fence and an empty quoted fence, native text
insertion repairs the delimiter, Preview restores the code block, and original cell IDs/content
round-trip without changing neighboring cells. This verifies actual input is not rejected by the
revision check in those cases; it is not a multi-browser or native-IME certification.

### Prefix-only caret indentation

Collapsed-selection indentation now produces a line-prefix change (zero to two removed characters,
at most two inserted spaces) instead of slicing, splitting and rebuilding the entire caret line.
The shared whitespace-width helper handles tabs and spaces for both caret and multi-line paths.
A 100,000-character line regression failed against the old whole-line descriptor; indentation,
input-history and source-dialog suites now pass 53 tests. Line-start discovery may still scan the
prefix, and callers that publish a full textarea string still reconstruct that string; only the
change descriptor's copied text and intermediate allocation are constant-size in this case.

Single-cell Markdown/Mermaid source indentation now consumes that same change descriptor and
calls native setRangeText only for its range. It no longer constructs a separate full-buffer
replacement before updating the textarea. A real textarea spy test first failed on the old
100,000-character replacement, then passed with only two inserted spaces. The obsolete
indentSourceLines production adapter/type was removed after confirming no remaining callers;
tests apply descriptors locally to verify resulting text/selection. Source view/input/indentation
tests passed 23 cases before removing the adapter, and the final utility rerun passes 17 cases.
Controlled source publication still reads the complete textarea value; no O(1) end-to-end claim.

### Source shortcut composition lifecycle

Markdown and Mermaid source views now pass their composition-session state to the shared shortcut
handler, in addition to checking native isComposing/keyCode flags. Previously an unflagged Ctrl+Z
between compositionstart and compositionend invoked document undo. Both node-view regressions
failed before the change; the node-view and input-history suites now pass 26 tests. The common
guard also protects indentation and redo. These are synthetic lifecycle tests, not OS-IME tests.

Mermaid source restoration is additionally tested after an external update shortens source while
preview is open. Empty, Chinese single-character and shorter diagram text all reopen with a
valid clamped caret and no document write or unsolicited source opening. The existing native
textarea range clamping handles these cases unchanged; all 12 Mermaid controls tests pass
(`/tmp/notebook-mermaid-shrunk-source.log`). Real scroll geometry remains outside this DOM test.

Mermaid clipboard feedback now belongs to a source revision and copy-request sequence. Source
changes/unmount invalidate outstanding feedback; newer requests supersede older success/failure
messages. Two delayed-promise regressions failed before the fix and all 14 controls tests pass
(`/tmp/notebook-mermaid-copy-final.log`). The request counter uses constant space. This governs
UI feedback only, not cancellation or ordering of the browser's clipboard writes; tests mock the
clipboard and do not access the user's system clipboard.

Queued Markdown-source focus now has explicit regression coverage for editor destruction,
same-cell external revision, unmount and the valid post-transaction focus case. The current
ownership/cleanup checks pass unchanged; all 11 source node-view tests pass
(`/tmp/notebook-source-focus-owner.log`). These tests drain the actual queued microtask and assert
focus ownership, rather than only checking the synchronous input handlers.

### Current full integration gate

The complete current suite passes: 685 tests across 85 files, exit 0, in 133.80s
(`npx vitest run --maxWorkers=2`, `/tmp/notebook-current-integration.log`). No build ran alongside
this gate and existing test timeouts were unchanged. It includes the latest source revision,
composition, indentation, focus, Mermaid feedback and file-routing work. This is a full-suite
green result, unlike the earlier isolated retries; it still does not establish native OS-IME,
crash-durable drafts, cross-tab conflict safety or full document virtualization. Type checking
and production build were not rerun as part of this gate.

Code-editor scroll restoration now runs only when a suspended serialized snapshot exists.
Fresh mounts and repeated restoration calls no longer enqueue unnecessary CodeMirror measure
callbacks. Two regressions failed before the guard and pass after it; session and activation
suites pass together (20 tests). Restoring still retains measured placeholder height and releases
the serialized snapshot, while undo/folds remain covered. This removes one callback per fresh
mount, not the O(document size) snapshot serialization or full-document rendering costs. The
full integration gate above predates this small follow-up; no new full-suite/build claim is made.

### Unapplied source draft page-exit protection

Source sessions now publish dirty/clean transitions to their registry. The registry maintains
a dirty-owner set and installs one `beforeunload` listener only while unapplied edits exist;
page-exit checks are O(1) rather than scanning all retained drafts. Applying, cancelling, or
undoing to the original buffer removes protection when the last dirty owner becomes clean.
Named drafts remain protected across route detachment; anonymous drafts are protected while
attached and released on detachment because they cannot be reopened by notebook identity.
Released owners cannot re-register through later edits. Registry bookkeeping is O(drafts),
and detecting equality with the original source still has worst-case O(source length) cost.

The dialog explicitly states that unapplied drafts remain memory-only. This is a browser exit
warning, not persistence or crash recovery: mobile lifecycle termination and browser policies
can bypass the prompt (see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
No database migration or writes were introduced. Session, registry and real dialog-event tests
pass together: 57 tests (`/tmp/notebook-draft-unload-final.log`), including dirty undo/redo,
multiple notebooks, rejected apply, effect replay, stale owners and cancellation. The tests
dispatch DOM events, not native browser confirmation dialogs. Typecheck remains at 307
diagnostics with none matching the changed source-session/registry/dialog files
(`/tmp/notebook-draft-unload-types.log`); the whole project typecheck is still not green.

### Source draft viewport restoration

Reopening a retained named-notebook draft now restores its caret/range (including backward
selection) and both scroll offsets, in addition to text and undo history. Previously all three
selection regression cases reopened at position zero. Layout cleanup captures the textarea
before detachment; layout setup restores selection and scroll after opening/focusing the modal.
Trigger focus restoration stays in passive cleanup so the button has first been re-enabled.
Only two numeric viewport offsets are added per draft (O(1) storage); no DOM nodes or extra
document snapshots are retained, and no per-scroll React updates are introduced.

The dialog and registry suites pass: 52 tests, including three remount selection directions
and fresh viewport/history after both Apply and Cancel (`/tmp/notebook-source-viewport-final.log`).
These are DOM tests with assigned scroll offsets, not native browser layout/scroll validation.
No production build or whole-project typecheck was rerun for this follow-up.

### Composition ownership across source transitions

All source-mode node replacement entry points now share one lifecycle predicate: the editor
must be live, editable, and outside ProseMirror composition. This extends the existing nested
fence protection to executable fence breaking, executable source editing, source preview, and
selected Markdown source editing. Rejected transitions dispatch no transaction or preliminary
store-backed attribute synchronization; the same operation works after composition ends.
The guard is O(1) and executes before serialization/conversion.

Four new transition regressions failed before the change. Source transitions, the fence scanner,
and wrapper-preserving replacement pass together (96 tests, `/tmp/notebook-transition-ime-final.log`).
Existing coverage includes broken/repaired empty and nested fences, delimiter growth, mixed
newlines, Unicode and 1000-cell source selection. Composition tests control the editor's reported
composition state; native OS input-method behavior remains unverified. This is not a completion
claim for source fidelity, diagram support, or the broader optimization goal.

### Full source-lifecycle integration gate

The current whole suite passes: 701 tests across 85 files in 117.62s, exit 0
(`npx vitest run --maxWorkers=2`, `/tmp/notebook-integration-source-lifecycle.log`). This includes
the source-draft exit protection, viewport restoration, editor suspension and unified composition
transition guards. Existing timeouts were unchanged and no build ran concurrently. This replaces
the earlier 685-test gate as the latest full-suite evidence; it does not establish native OS-IME,
crash recovery, cross-tab conflict handling or full document virtualization.

The subsequent production build also passes, exit 0 in 1m 1s
(`/tmp/notebook-source-lifecycle-build.log`). NotebookApp is 2099.61 kB minified / 669.24 kB gzip;
CodeDisplay and HighlightedSource still emit separate chunks. Vite still reports oversized
chunks and the mixed dynamic/static notebookStore import warning; build success is not a
bundle-size or startup-latency target being achieved. TypeScript checking is a separate gate
and was not rerun in this integration pass.

### Browser Mermaid family and recovery audit

An isolated headless Chrome 151 profile exercised the actual MermaidRenderService and Mermaid
library against the current development server. Flowchart (Chinese labels), sequence (Chinese
labels), state, class, Gantt and pie examples were queued together with alternating light/dark
themes. All six returned parseable SVG with the expected semantic label and graphical elements;
no `dfamily-audit-*` temporary render containers remained. The separate configuration audit
also passed: per-diagram custom color did not leak to following diagrams, theme transitions
initialized three times as expected, and a malformed diagram rejected without blocking a
subsequent valid diagram. Scripts: `/tmp/notebook-mermaid-family-audit.mjs` and
`/tmp/notebook-mermaid-config-browser.mjs` (both exit 0).

The isolated browser was closed after verification; the user's browser and development server
were left running. No production code changes were needed. This verifies real library rendering
and queue recovery, not screenshot-level visual quality, every Mermaid grammar, or full editor
interaction for each diagram family.

### Appended source identities and history retention

Two new regressions establish the ownership constraint for future draft-memory compaction:
appending Python, undoing, redoing, then branching to an appended raw cell must preserve each
source boundary's original identity and type. The document model still decodes old source
branches to their original cell objects, while the session/history path invalidates redo when
the branch changes and publishes only the selected branch. All 38 document/registry/history
tests pass (`/tmp/notebook-source-branch-identities.log`). Production behavior was unchanged.

Append metadata cannot safely be recycled based only on the currently visible source: undo/redo
can still reference it. Entries currently grow with total append operations during a source
session, not just the visible cell count. Bounding this memory therefore remains unfinished and
must coordinate history retention with document-boundary ownership rather than reusing indices.

### Transaction-consistent file reads

FileRepository.getFile now reads metadata, updates access statistics and reads local content in
one readwrite transaction spanning the metadata/content stores. Previously three independently
scheduled transactions could read one revision, overwrite newer metadata with stale access
statistics, and return another revision's content. All dependent requests are scheduled directly
from IndexedDB callbacks; results are returned only after the provider acknowledges completion.
Missing records still return null, remote/missing content still requests remote fetch, and
synchronous statistics-write errors reject rather than leaving the callback unresolved.

Repository/provider/autosave tests pass together: 34 tests
(`/tmp/notebook-file-read-transaction.log`). Six new repository cases verify single-transaction
usage, delayed completion, abort propagation and existing read semantics using controlled store
requests. Native concurrent IndexedDB transactions are not covered by this mocked test harness.
This reduces local getFile from three transactions to one, but does not make autosave's separate
notebook-list metadata and snapshot writes atomic; that larger write-side gap remains open.

### Indexed notebook file loading

FileRepository.getFilesForNotebook now queries the existing `notebookId` index instead of
materializing and filtering every file's metadata. Application-side metadata work/storage is
O(k) for the selected notebook's k files rather than O(N) for all files in the database. When
content is requested, local-content reads are scheduled from the index request's callback in
the same readonly transaction; metadata-only queries do not include the content store at all.
This removes per-file transaction overhead and keeps each list result within a transaction's
view of the metadata/content records. Content materialization still costs O(selected bytes),
and pending requests/results scale with k; this is not pagination or constant-space loading.

Three index/transaction tests failed before the change. All 39 repository/provider/autosave
tests now pass, including 1000 local files, empty indexed results, missing local content, remote
entries and preserved result ordering (`/tmp/notebook-file-index-final.log`). No schema upgrade
or compatibility scan fallback was introduced. Native database contention and wall-clock
loading benchmarks remain separate validation work.

### Transaction-owned content updates

FileRepository.updateFileContent now performs its existence check, metadata update and content
write in one readwrite transaction. A delete that commits before the update's read therefore
leaves the file absent (false result), instead of a previously read metadata snapshot recreating
it. Payload-size calculation happens before acquiring the transaction, and successful results
are acknowledged only after transaction completion. This reduces the update from a separate
read plus write transaction to one transaction; payload-size work remains O(content bytes).

Three regressions failed before the change and now pass, covering transaction-local metadata,
missing records despite a stale external read, and commit failure propagation. All 42
repository/provider/autosave tests pass (`/tmp/notebook-file-update-final.log`), with a clean
`git diff --check`. These controlled-request tests do not replace native concurrency validation.
Cross-tab edit conflict resolution and notebook snapshot/list-metadata atomicity remain open.

### Native IndexedDB transaction verification

The current repository/provider implementations passed an isolated Chrome IndexedDB audit
(`/tmp/notebook-native-idb-audit.mjs`, exit 0). A uniquely named temporary database containing
only the file metadata/content stores was injected into the real provider; no app/user database
was opened by the audit. Twenty interleaved update/read pairs, queued without awaiting each
operation, returned revisions 0 through 19 respectively with matching content sizes. The indexed
list returned only the requested notebook and its final revision, excluding another notebook.
A queued delete followed by update returned false for the update and null for the subsequent
read. Injecting a callback failure after scheduling both metadata and content writes rejected
the transaction and left neither record persisted.

The temporary database was deleted after each run and the isolated browser closed. This is
native same-connection transaction ordering/rollback evidence, not a cross-tab optimistic
conflict protocol or timing benchmark. The separate autosave notebook-list metadata transaction
is outside this audit and remains a write-side atomicity gap.

### Remote-reference cache retention

FileRepository.saveFile now selects metadata-only storage for an oversized file only when the
caller supplies a nonblank remote reference and forceLocal is false. Without that reference,
the body remains local instead of silently omitting the only supplied content. Switching a file
to remote storage deletes its obsolete local body in the same transaction as the metadata
update, so cache reclamation and the hasLocalContent flag cannot commit independently.
Forced-local notebook snapshots retain their existing behavior. A supplied URL is a reference,
not a verified availability/durability guarantee; no network probe or migration was introduced.

Four policy/eviction regressions failed before the fix. The final 47 repository/provider/autosave
tests pass, including a forceLocal case with a remote reference
(`/tmp/notebook-remote-retention-final.log`). Tests use controlled stores; no user's stored data
was deleted by this verification. Native rollback of this specific remote transition remains
to be checked, beyond the preceding generic two-store rollback audit.

### Native long-source draft restoration

An isolated Chrome run verified the source dialog with a 500-line Python cell. After a native
Input.insertText edit, a backward range around line 350 and a real scrollTop of 6000 were set.
Navigating away through the app router and returning, then reopening Notebook source, restored
the exact source string, selection endpoints/direction and scrollTop after two animation frames.
The live stored cell content remained equal to the pre-draft value. The test then cancelled the
draft and closed the isolated browser (`/tmp/notebook-source-viewport-audit.mjs`, exit 0).

This strengthens the earlier DOM-only viewport tests with actual textarea layout and route
lifecycle evidence. It tests vertical scrolling in Chrome, not horizontal overflow, other
browser engines, OS input-method composition, or recovery after a full page refresh.

### Sparse external synchronization

External store-to-editor synchronization now uses the same changed-run/LIS range planner as
source application. Previously two separated external changes produced a single replacement
spanning unchanged middle cells. Ranges are now applied right-to-left using one prefix-offset
table; single-cell runs retain fine-grained text-diff selection mapping, while structurally moved
selected cells retain ID-based relocation. The unused single-span planner and its private
comparator were removed after verifying there were no remaining consumers.

The new regression failed before migration and now verifies two local steps, no deleted mapping
for the middle cell, retained node identity and unchanged caret offset. Synchronization, source
transitions and source application pass together: 92 tests
(`/tmp/notebook-sync-ranges-final.log`), including 500/1000-cell cases. Stable-order range planning
and offset construction are O(n); structural range planning is O(n log n), with O(n) auxiliary
storage. Projection still traverses the document and ProseMirror step costs depend on the number
and shape of changed runs; this is not an O(1) typing or globally optimal rendering claim.

### Selection endpoints after external reordering

Structural synchronization now records both text-selection endpoints, not just the anchor.
Endpoints in retained blocks use transaction mapping; endpoints in replaced/moved blocks are
relocated by cell ID and clamped intra-block offset. TextSelection.between reconstructs a valid
range rather than collapsing it through Selection.near. The endpoint records are constant-size;
restoration scans the next blocks once and does not build another document-sized lookup map.

Four forward/backward cases cover both sides of a two-cell reorder (retained and moved cell),
and all 36 synchronization/source-application tests pass (`/tmp/notebook-moved-selection-final.log`).
The initial two cases selected only the retained cell and passed before the change; those alone
were insufficient evidence, so coverage was expanded to the other cell. This is model-level
selection evidence, not native drag-selection or cross-cell range verification.

Cross-cell forward/backward reorder cases now verify both endpoints retain their original cell
ownership and offsets. A further regression exposed that moving and editing a cell in the same
external update restored the old offset without accounting for inserted text. The shared
same-markup block-content diff now drives both ordinary text replacement and a relative StepMap
for relocated endpoints. Prefix insertion, prefix deletion and empty-body cases pass; the
insertion case failed before the change. All 41 synchronization/source-application tests pass
(`/tmp/notebook-moved-text-final.log`). This strengthens model coverage, not native drag-selection
coverage. Multiple disjoint edits within one block still use one contiguous content diff, as the
existing single-cell synchronization does; exact intent-aware mapping between those edits is
not claimed.

### Full storage/selection integration gate

The complete current test suite passes: 732 tests across 86 files, exit 0 in 238.62s
(`npx vitest run --maxWorkers=2`, `/tmp/notebook-storage-selection-integration.log`). This includes
the indexed file repository, transaction-owned reads/updates, remote cache policy, sparse
external synchronization, moved/edited selection mapping and source history branch regressions.
No build ran concurrently and test timeouts were unchanged. This supersedes the 701-test gate
as current full-suite evidence; production build/typecheck were not rerun in this pass.
The concise use-case audit and outstanding risks are in `docs/EDITOR_OPTIMIZATION_STATUS.md`.

### Shared prepared file records for aggregate saves

FileRepository.saveFile now delegates record construction and transaction-local requests to
FileRecordSet. This separates pure preparation (metadata, optional content, bounded preview,
local/remote policy) from ownership of the transaction. A future notebook aggregate save can
reuse the same record preparation/write logic inside its wider transaction rather than invoke
saveFile, which opens a transaction of its own. The existing repository already uses the new
class; its former record-building body and unused compression-option local were removed.
No alternate save path or compatibility implementation was retained.

All 49 record/repository/provider/autosave tests pass (`/tmp/notebook-file-records-final.log`),
including explicit metadata/body identity and remote-eviction preparation tests. Public saveFile
behavior and record format remain unchanged. This is a prerequisite refactor, not completed
notebook aggregate atomicity: AutoSaveService still invokes the separate metadata/file saves.

### Atomic notebook snapshot migration

AutoSaveService now calls NotebookRepository.saveNotebookSnapshot instead of independently
calling saveNotebook and FileRepository.saveFile. The repository reads createdAt and writes
notebook metadata, activity, file metadata and forced-local content within one transaction over
all four stores. FileRecordSet supplies the existing file format/policy. Ordinary saveNotebook
uses the same private transaction implementation with only notebook/activity stores; the old
separate activity-write helper was removed. Snapshot identity mismatches fail before opening
a transaction, and success is acknowledged only after commit.

All 54 targeted autosave/record/repository/provider tests pass
(`/tmp/notebook-atomic-snapshot-tests.log`). Autosave tests now mock the aggregate entry point,
exercise its retry/single-writer behavior, and explicitly ensure the old separate save methods
are not called. Typecheck remains at 307 diagnostics with none matching the changed persistence
interfaces/record/repository/autosave files (`/tmp/notebook-atomic-snapshot-types.log`).

The real IndexedDB audit was extended to all four stores. After seeding a complete snapshot,
injecting a failure at content put left a serialized readback of all four stores unchanged.
The save rejected; a subsequent normal retry committed the new notebook title and body together
(`/tmp/notebook-native-idb-audit.mjs`, exit 0). The initial script attempt preceded the browser's
debug port readiness and exited with ECONNREFUSED; after confirming the same browser was live
and listening, the audit ran successfully. Its uniquely named database was deleted and isolated
browser closed; user data was untouched.

This closes the separate notebook-list metadata/snapshot write gap noted in earlier entries.
It does not implement stale-revision conflict checks across tabs, crash-durable unapplied source
drafts, quota-specific fault tests or incremental O(changes) persistence. Full-suite/build gates
have not yet been rerun after this migration.

### Post-atomic-save integration gate

The complete suite now passes after the aggregate snapshot migration: 739 tests / 88 files,
exit 0 in 71.73s (`npx vitest run --maxWorkers=2`, `/tmp/notebook-atomic-full.log`). The subsequent
production build passes in 38.02s, exit 0 (`/tmp/notebook-atomic-build.log`), with NotebookApp at
2099.82 kB minified / 669.31 kB gzip. Test timeouts were unchanged; build and tests ran sequentially.
Oversized-chunk warnings remain. `git diff --check` is clean. These gates supersede the earlier
pre-migration full-suite/build results, but do not close the outstanding draft durability,
cross-tab conflict or complete virtualization requirements.

### Transaction-owned notebook access statistics

NotebookRepository.getNotebook and updateAccessTime now share one transaction-owned access
operation. It reads the latest notebook, updates its count/time and acknowledges completion
under one readwrite transaction. This removes getNotebook's redundant second read and prevents
an old access-statistics snapshot from overwriting a newly saved title or recreating a deleted
notebook. getNotebook returns the accessed record, including the newly incremented count;
missing records still return null and updateAccessTime remains a no-op for them.

The stale-title/deleted-notebook regressions failed before the change; all 37 notebook/provider/
autosave tests pass (`/tmp/notebook-access-final.log`), including single-read access and absent
records. No full suite/build or native concurrency audit was rerun for this follow-up. Logical
cross-tab editing conflicts still require revision checks independently of access-statistics
transaction safety.

### Composition-safe source cancellation

The source dialog now checks composition in its shared cancel operation, rather than only in
the native dialog cancel handler. Previously the Cancel button bypassed that protection and
unmounted the textarea while its composition flag was active. The new button regression failed
before the change and confirms the draft remains mounted until composition ends; a subsequent
Cancel closes it without applying text. All 54 dialog/registry tests pass
(`/tmp/notebook-source-cancel-final.log`). This uses component composition events, not a native
OS input-method audit. The existing native dialog path delegates to the same guarded operation.

### Clean source buffers with retained edit history

Detaching a named source draft now releases it as untouched only when its source is unchanged
and neither undo nor redo is available. Previously undoing back to the original source made
hasEdits false, so route detachment discarded the remaining redo branch. A new regression
failed before the change and now resumes the same draft, redoes its edit, and verifies explicit
Cancel still releases it. All 65 registry/history/dialog tests pass
(`/tmp/notebook-clean-redo-final.log`).

Completely untouched drafts and anonymous detached drafts retain their existing release rules.
Unchanged text alone does not trigger the unload warning even when history is retained. This
deliberately preserves meaningful history in memory; it is not bounded retention or durable
draft persistence, and can retain more memory than the former incorrect early-release rule.

### Preserve node selections during external reordering

External synchronization now restores NodeSelection when the same cell ID survives at the
mapped position and its node is selectable. Previously generic Selection.near converted a
moved image selection into a nearby text caret. The image-reorder regression failed before
the change; the synchronization suite now passes all 38 tests, including removal of the
selected image without incorrectly selecting the following text cell as a node. Restoration
uses the existing endpoint scan and adds constant work; projection and structural planning
complexities are unchanged. This is model-level coverage, not a native drag-selection audit.

Full regression after this and the access-statistics/source cancellation/redo follow-ups:
747 tests across 88 files pass in 58.88s, exit 0 (`/tmp/notebook-selection-full.log`,
`npx vitest run --maxWorkers=2`). No concurrent build or timeout changes. `git diff --check`
passes. The earlier production build/typecheck results predate these follow-ups.

### Generated-content append semantics

Markdown append now uses the same lexer-based heading recognition as notebook title ownership,
covering ATX H1–H6 and Setext headings without treating hashtags or indented/fenced code as
headings. Markdown and code append create a new cell with its complete incoming content,
removing the intermediate empty-cell publication and subsequent updateCell traversal. Existing
body append still uses updateCell. The shared leading-heading function replaces the independent
trim/hash-prefix rule; it lexes source and is not a constant-time operation.

Six new regression cases failed before this change (hashtags, indented code, two Setext forms,
and intermediate publication for both cell types). All 58 identity/structure tests pass after
the change (`/tmp/notebook-append-after.log`). The subscription checks verify every observed new
body already contains its text; they do not claim all store notifications are eliminated.
The broader store/Markdown gate also passes: 116 tests across 11 files, exit 0 in 5.11s
(`/tmp/notebook-append-integration.log`). `git diff --check` is clean. The 747-test full-suite
result predates this append change; no production build was rerun for this follow-up.

### Whole-document selection is not cell-owned

An AllSelection now bypasses cell-endpoint relocation during external synchronization and
uses ProseMirror's own whole-document mapping. Replacing the first cell previously relocated
its anchor as if it belonged to that cell and collapsed the selection to a text caret. The
new regression failed before the change and verifies both selection class and full bounds
after replacing the title and appending a cell. No extra document scan or retained data was
introduced. All 99 synchronization/source-transition tests pass in 14.59s, exit 0
(`/tmp/notebook-all-selection-after.log`), and `git diff --check` passes. This is model-level
coverage, not a native keyboard/clipboard audit; full-suite/build gates predate this follow-up.

### Selected-range source indentation without copying the unselected tail

The shared indentation descriptor now stops at the selection endpoint instead of searching
for and copying the remainder of its last line. Outdent extends only as far as necessary to
remove that line's complete indentation prefix. This avoids processing/allocating an arbitrarily
large unselected suffix; finding the first line boundary and processing the selected region
still cost work, and textarea value publication still materializes the full result.

Two 100,000-character short-selection regressions failed before the change. They now assert
small exact replacement ranges for indent and outdent. Additional coverage checks cross-line
endpoint mapping when outdent consumes beyond the selected prefix. All 61 indentation,
input-history and source-dialog tests pass in 18.27s (`/tmp/notebook-indent-range-final.log`);
`git diff --check` passes. Full-suite/build results predate this follow-up.

### Integrated regression gate after append, selection and indentation changes

The full suite passes 761 tests across 88 files, exit 0 in 102.87s
(`/tmp/notebook-editor-integrated-final.log`). The subsequent production build passes in
59.68s (`/tmp/notebook-editor-integrated-build.log`), retaining oversized-chunk warnings:
NotebookApp is 2100.08 kB minified / 669.41 kB gzip. Tests and build ran sequentially with
unchanged test timeouts. Typecheck then exits 2 with 307 diagnostics
(`/tmp/notebook-editor-integrated-types.log`); an exact diff of its `error TS` lines against
`/tmp/notebook-atomic-snapshot-types.log` is empty. These are integration gates, not latency
benchmarks or proof of draft durability, full virtualization, or cross-tab conflict safety.

### Mermaid error-state geometry

A failed preview now retains the last measured diagram height as a minimum, just like the
loading placeholder retains its height. Previously a valid large diagram followed by invalid
source collapsed into the small error message, moving following cells during editing. Minimum
height leaves long diagnostic text free to grow; successful rendering and explicitly empty
source do not retain the error-style minimum. No SVG cache or extra render was introduced.

The new ready→failed→retry→ready regression failed before the change and checks geometry style
through each transition. All 31 Mermaid preview, NodeView and render-service tests pass
(`/tmp/notebook-mermaid-error-height-after.log`); `git diff --check` passes. Height is mocked in
this component test, so it does not establish native browser layout-shift measurements.
The 761-test full suite and integrated production build predate this follow-up.

Native follow-up: an isolated headless Chrome profile mounted the actual MermaidPreview,
ThemeProvider and loaded editor styles with real Mermaid rendering, plus a following-content
sentinel. A five-node vertical flowchart measured 443.203125px tall. Its following-content top
remained exactly 463.203125px through valid→invalid→repaired source; the error and recovered
states retained the same measured height. `/tmp/notebook-mermaid-layout-audit.mjs` passed and
unmounted its temporary component. The first harness attempt failed on Vite's CommonJS default
export shape; correcting that harness import allowed the same live browser to complete the
audit. This verifies one real layout transition, not cumulative layout shift for all diagrams,
all themes, or multiple browser engines. The user's browser/notebook was not modified.

### Apply known indentation ranges in the notebook source dialog

The notebook-wide source dialog now passes the indentation descriptor into its shared native
input/selection restoration operation. Previously it computed a small replacement but then
called setRangeText with the entire draft, losing the benefit at the DOM boundary. Undo/redo
still restores its complete history result because no changed-range descriptor is exposed
there; this is not a constant-time history claim.

The new component regression failed before the change and now verifies a one-character
backward selection replaces only that character plus indentation, retains direction and
mapped endpoints, and undoes to the original source. All 52 dialog/indentation tests pass
(`/tmp/notebook-source-local-after.log`, exit 0 in 8.14s). The draft/history still materialize
full strings, and this targeted gate does not replace the earlier full-suite/build evidence.

### Native history ownership for source NodeViews

Markdown source and Mermaid source inputs now share a native beforeinput history subscription.
Cancelable historyUndo/historyRedo events route to the same ProseMirror commands as keyboard
shortcuts, rather than leaving browser-local textarea history as a second owner. Composition,
read-only, destroyed-editor and current-node ownership checks precede routing; noncancelable
events remain browser-owned. Listener cleanup follows the mounted source input, including
Mermaid preview/source transitions.

Both Markdown native-history regressions failed before implementation. The targeted suite
passes 42 tests across source NodeView, Mermaid controls and keyboard history, including
composition/read-only guards and proving a detached Mermaid input no longer runs history
while the new input runs exactly once (`/tmp/notebook-native-history-final.log`). These are
dispatched InputEvents in component tests, not an OS Edit-menu audit. Full-suite/build gates
predate this follow-up.

### Linear ordered-survivor structural planning

The LIS planner directly extends its tail when a retained block follows the previous tail in
the original order. Common sparse insertions/deletions therefore do not binary-search every
surviving block: subsequence planning is O(n) for ordered survivors, while arbitrary reorders
remain O(n log n) worst case and O(n) auxiliary space. These bounds concern block planning;
node equality may traverse content when references differ, and applying ProseMirror steps has
its own cost. No claim of constant-time document synchronization follows.

Added a 10,000-block sparse insertion/deletion case with exact minimal ranges and a mixed-order
case exercising transitions between direct extension and binary search against an LCS oracle.
The existing randomized reconstruction/optimal retained-count checks remain. All 43 planner
and document synchronization tests pass (`/tmp/notebook-ordered-structure.log`, 9.06s), and
`git diff --check` passes. This is an algorithmic improvement, not a measured UI latency budget.

### Stable code-output projection and DOM ownership

CodeCellViewModel now owns an OutputProjection that caches the current immutable output array
and weakly caches each source object's normalized result. Repeated getter reads, hover and
toolbar changes reuse the same array in O(1). A new array still needs O(n) traversal, but retained
objects keep their normalized payloads and keys rather than repeatedly stringifying images or
generating random identities. Weak keys do not strongly retain obsolete source output objects.
This relies on the store's immutable output updates; it does not support in-place mutation.

OutputDisplay no longer keys its whole subtree by output count/update counters. Existing rows
remain mounted when another result is appended. Removed the unused output-update counter path
and the unreferenced useOutputProcessing hook (including its 100ms timer and duplicate
projection), after confirming no remaining source callers. These tracked removals are recoverable
through Git. The active view-model path had no caller of its increment method; this is not a
claim that the active path previously polled every 100ms.

All 35 CodeCell tests across 8 files pass (`/tmp/notebook-output-stability.log`, 7.55s), including
single image normalization across append, stable getter identity and preserved existing output
DOM across unrelated rerenders/append. `git diff --check` passes. Actual rendering may still
visit all output rows, so this is not output virtualization or constant-time streamed append.
Typecheck still reports 307 diagnostics (`/tmp/notebook-output-types.log`), with none naming
OutputProjection, OutputDisplay or sourceInputHistory. An additional boundary remains:
updateCellOutputsHelper currently clones every output during serialization, so weak identity
reuse benefits retained objects but does not yet stabilize anonymous keys across those cloned
store snapshots. The DOM append test uses retained source objects and must not be generalized
to that cloning path. Full-suite/build gates predate this follow-up.

### Canonical output reuse across serialized snapshots

updateCellOutputsHelper now reconciles serialized output rows with the current canonical
snapshot before publication. Same-position shallow-equal rows retain their immutable objects;
identical snapshots retain the array and skip the store update. Changed/removed fields or
changed nested object references are not hidden. Error/empty sentinel construction remains
upstream of reconciliation, preserving its existing behavior. Equal duplicate rows remain
separate identities; this is not a content-deduplication cache.

The store identity regression failed before the change. The subsequent gate passes 90 tests
across 10 files (`/tmp/notebook-output-store-final.log`, 8.88s), including a real store update→
OutputProjection→OutputDisplay append case that retains the original DOM element. This closes
the serialized-clone limitation noted above for unchanged rows at stable positions. Anonymous
rows moved to different indices are not matched, and snapshot serialization plus field
comparison remains linear in rows/fields (payload stringification has its own byte cost).
`git diff --check` passes; full-suite/build gates predate this follow-up.

### Skip unchanged output rendering and isolate ANSI state

OutputRenderer now uses React.memo with the stable immutable output objects provided by
OutputProjection. Unrelated parent updates no longer repeat ANSI conversion for unchanged
rows. Parent list reconciliation still visits output entries; this is not list virtualization.
TextOutput creates an ANSI parser for its own snapshot rather than sharing one mutable parser
across all output cells. An unterminated color sequence in one output previously colored a
different independent output, making presentation depend on rendering order.

Both new regressions failed before the change: the unchanged output parsed twice, and the
second plain output inherited red styling. The tests now verify one parse for an unchanged
object, another parse after replacement, and isolated formatting. Full-suite/build gates
predate this follow-up; the CodeCell gate is recorded in `/tmp/notebook-output-render-after.log`.

### Image-output resource lifecycle

Image output failures now render through React state, scoped to a URL-keyed resource component.
The previous handler imperatively hid the image and appended error DOM on every error event;
replacing the URL under a stable output key retained that hidden style and stale error nodes.
The new lifecycle emits one error state, releases the failed image, and starts a fresh image
when its URL changes (including changing back to an earlier URL). It adds no global cache.

The new regression failed before the change and verifies repeated errors do not duplicate the
message, replacement images remain visible, old detached image events cannot poison the new
state, and changing back permits another attempt. The CodeCell suite passes 39 tests across
9 files (`/tmp/notebook-image-output-after.log`); `git diff --check` passes. These dispatched
image events do not establish real network/decode behavior. Full-suite/build gates predate this
follow-up.

### Output value fidelity and a single generated-key owner

Text/error normalization and text/HTML rendering now use nullish empty-value handling, so
numeric zero and boolean false remain visible rather than becoming empty strings. Explicit
numeric-zero and empty-string output keys are retained. Automatic key generation now belongs
only to OutputProjection; processOutput preserves provided keys and no longer independently
allocates timestamp/random keys, including conversion failures.

All six added falsy-value/key regressions failed before the change. The CodeCell gate passes
45 tests across 9 files (`/tmp/notebook-output-values-after.log`), covering text, error and HTML
both at projection and rendering boundaries. `git diff --check` passes. The preceding 785-test
integration result/build predates this follow-up; arbitrary HTML trust policy is unchanged.

### Integrated gate including output rendering and native source history

All 785 tests across 92 files pass in 61.01s, exit 0
(`/tmp/notebook-output-integrated-tests.log`). Sequential production build passes in 31.47s
(`/tmp/notebook-output-integrated-build.log`); NotebookApp is 2100.17 kB minified / 669.38 kB gzip
and oversized-chunk warnings remain. Typecheck exits 2 with 307 diagnostics
(`/tmp/notebook-output-integrated-types.log`). Compared to the previous integrated typecheck,
ignoring source-coordinate shifts leaves only the displayed ordering of one union type in
the existing chart.tsx constraint error. `git diff --check` passes. These checks include the
latest output identity, ANSI, image lifecycle, native source history and LIS fast-path changes;
they do not prove latency budgets, durable drafts or cross-tab conflict safety.

### Apply source undo/redo as native input ranges

SourceDraftHistory.step can publish the actual transaction replacement ranges after advancing
its model. The source dialog applies old-coordinate ranges in descending order and restores
history selection through the same operation used by indentation. Keyboard, native history
events and toolbar buttons use this path; the full-text setRangeText history path was removed.
The existing boolean step result and callers without a range observer are unchanged.

Three new component regressions failed before integration. They verify undo of one inserted
character writes only its deletion range and redo writes only its insertion range across all
three entry points. All 55 source-history/dialog tests pass in 7.81s
(`/tmp/notebook-history-range-after.log`); `git diff --check` passes. History still materializes
its current string and textarea internals have their own costs, so this reduces native write
payloads, not total undo to O(1). Full-suite/build gates predate this follow-up.

Incremental-history follow-up: a deterministic seeded test generates 30 histories of 30
replacement attempts, including Unicode, multiline insertions, deletions and directional
selections. It maintains a separate string mirror using only the published replacement ranges,
then undoes and redoes every actual edit against saved expected snapshots. It also checks range
bounds, selection bounds and that exhausted undo/redo emits no callback. All 56 history/dialog
tests pass (`/tmp/notebook-history-random-ranges.log`, 8.71s). This adds broader model evidence
for range application; it is not an exhaustive Unicode/IME or native-browser history proof.

### Plain Backspace owns structural conversion

Code-cell fence interception and standalone empty-code conversion now share a plain-Backspace
predicate excluding Ctrl/Meta/Alt/Shift modifiers. Standalone conversion additionally requires
an empty CodeMirror selection; a backward selection ending at offset zero no longer converts
the whole whitespace cell instead of deleting selected text. Existing IME guards remain.

All five modified-key/selection regressions failed before the change. The CodeCell gate passes
67 tests (`/tmp/notebook-backspace-boundary-after.log`); `git diff --check` passes. The existing
plain empty-Backspace conversion test also remains green. Full-suite/build gates predate this
follow-up; platform-specific deletion shortcut behavior was not separately browser-audited.

### Empty-code conversion publishes its editing target synchronously

The standalone code-cell empty-Backspace path now sets editingCellId immediately after its
type transition, removing a 50ms delayed store write that could overwrite a newer editing
target after navigation. This is state publication, not imperative DOM focus; the destination
view still owns focusing after mount. The Tiptap fence-break interception remains unchanged.

The new regression failed before the change. It verifies immediate Markdown type/editing
target publication, no new timer, and that a subsequent editing target survives advancing time.
All 62 CodeCell tests pass (`/tmp/notebook-conversion-focus-after.log`); `git diff --check` passes.
Native focus after this standalone conversion has not been separately audited. Full-suite/build
gates predate this follow-up.

### Collapse-scroll ownership and cancellation

The code-cell view model owns at most one pending collapse scroll. Expanding again, scheduling
a newer collapse or unmounting cancels it; execution checks that the captured DOM element is
still connected, still owned by the same ref and still collapsed. This removes the old callback
that looked up whichever element happened to occupy the ref later.

The expand-before-timeout regression failed before the change. Coverage now includes removed
and replaced targets, unmount timer cancellation, and the normal collapsed target scrolling once
even after repeated collapse requests. The broad CodeCell gate passed 60 tests before the last
positive-path case (`/tmp/notebook-collapse-scroll-after.log`); the final model/hook gate is
`/tmp/notebook-collapse-scroll-final.log`. `git diff --check` passes. Native animated scroll
behavior was not re-audited; full-suite/build gates predate this follow-up.

### Focus/composition owns the expanded editing surface

Height publication still updates geometry while CodeMirror is focused or composing, but no
longer changes automatic expansion state during that interaction. Previously crossing the
height threshold could collapse an actively edited surface and hide the caret. The guard reads
the existing editor ref rather than introducing another independently synchronized focus flag.
Manual expansion policy remains authoritative, and subsequent measurements outside interaction
can resume automatic sizing.

Both focus/composition regressions failed before the change. The CodeCell gate passes 56 tests
(`/tmp/notebook-focused-height-after.log`); `git diff --check` passes. These tests use editor
interaction flags; native IME and threshold-crossing typing still require browser evidence.
Full-suite/build gates predate this follow-up.

### Active code-height ownership and lossless initial subscription

CodeEditor now sends active, non-detached content measurements to CodeCellViewModel through
useCodeContentHeight. The observer watches the wrapper and its editor child so constrained
viewports still report content growth; suspension/unmount disconnects observation and rejects
late callbacks. The view model ignores zero/non-finite hidden measurements, publishes actual
height changes once, and preserves manual expansion. Detached views remain unconstrained.
Removed the unreferenced useCodeExpansion hook and barrel export; Git can recover that tracked
file, but no parallel expansion policy remains in production.

CodeCell's subscription now uses useSyncExternalStore with a revision snapshot from the base
view model. This detects a child layout measurement that occurs between render and subscription,
which the former passive forceUpdate listener could miss. The base revision increments before
notifying subscribers; existing subscribers remain supported.

All 116 cell tests across 20 files pass (`/tmp/notebook-code-height-final.log`, 18.68s), including
observer cleanup, height publication and initial child-layout notification. Two old CodeEditor
fixtures initially omitted required refs via casts; supplying the actual ref/callback contract
fixed those fixtures. Typecheck remains at 307 diagnostics (`/tmp/notebook-code-height-types.log`)
with none naming the changed height/view-model modules. `git diff --check` passes. Real-browser
CodeMirror height growth, collapse and suspension geometry still require a dedicated audit;
full-suite/build gates predate this follow-up.

Native code-height follow-up: `/tmp/notebook-code-height-audit.mjs` passes in isolated headless
Chrome with the actual notebook and CodeMirror. A 120-line Python cell collapsed to 200px,
expanded to 2023.625px (2024px measured max), grew to 2057px after two appended lines, and
returned to 24.796875px with max-height:none after shortening to one line. Metadata updates
preserved manual collapse. The harness waits for the expansion animation to settle before
comparing growth.

Initial harness attempts hit CDP Promise-collected errors while awaiting a dynamic import.
Importing a query-free module also produced a separate development-store instance, so that
attempt's timeout was not valid evidence about shortening behavior. Retaining the timestamped
module import on window, resolving it separately, then using that active store fixed the
harness. The final measured transitions use the real mounted cell. No user browser/profile
was touched. This does not cover suspension/resumption geometry or multiple browser engines.

### Expansion responds to output transitions, not output presence

CodeCellViewModel now requires a changed output array before auto-expanding a collapsed tall
cell. Previously existing outputs caused unrelated text/metadata updates to reopen it. The
new regression failed before the change and verifies manual collapse survives unrelated
updates while genuinely new outputs preserve the existing auto-expansion behavior. All 51
CodeCell tests pass (`/tmp/notebook-collapse-after.log`); `git diff --check` passes.

This is model-level evidence with an assigned measured height. The audit also found that the
active CodeCell view-model hook currently does not wire setContentHeight; the old unreferenced
useCodeExpansion hook still contains resize observation. Restoring a single active measurement
owner and removing that obsolete hook remains necessary before claiming complete browser
collapse/resize behavior. Full-suite/build gates predate this follow-up.

### Atomic CodeCell view-model prop publication

CodeCellViewModel.updateProps now completes content synchronization, expansion and output
visibility before notifying subscribers once. Previously several branches notified separately,
exposing partial view state and repeating subscriber work within a single prop update. Replaying
identical props emits nothing; changing demo mode alone now emits an update even when the cell
object is unchanged. Output availability is read once from the cached projection.

Both new regressions failed before the change: one observed multiple partial snapshots and the
other missed the demo-only update. All 50 CodeCell tests pass
(`/tmp/notebook-vm-atomic-after.log`); `git diff --check` passes. This reduces model notification
work; it does not measure React's own batching or browser frame latency. Full-suite/build gates
predate this follow-up.

### Single-owner thinking/output toggle

The thinking-status branch no longer binds its toggle on both the visible control and its
ancestor. The visible status owns the action while displayed; the existing output-container
action remains on the output branch. The status control is now a native type=button instead
of a click-only div. No event-propagation suppression is needed to mask a duplicate handler.

The regression observed two callback invocations before the change and now verifies one
invocation plus native button semantics. All 48 CodeCell tests pass
(`/tmp/notebook-thinking-toggle-final.log`); `git diff --check` passes. Actual OS keyboard
activation was not separately audited. Full-suite/build gates predate this follow-up.

### Per-output render-failure isolation

Replaced OutputRenderer's ineffective JSX-construction try/catch with a React error boundary
around each output's child renderer. Failures now remain local to one output revision; changing
that immutable output object resets the failed state and retries. The boundary retains only
the output reference and failure flag, not another payload snapshot. Stable output memoization
still avoids rerendering unchanged rows. No extra DOM wrapper is added on successful renders.

A regression with a child-render conversion failure escaped render() before this change. It
now verifies the neighboring output survives, the failure has a local alert, and replacing the
bad output recovers. All 46 CodeCell tests pass across 9 files
(`/tmp/notebook-output-boundary-after.log`); `git diff --check` passes. This isolates synchronous
React rendering errors, not event-handler/network failures or arbitrary HTML execution.
Full-suite/build gates predate this follow-up.

### Separate output-list ownership from execution chrome

OutputDisplay now places only immutable output rows behind a memoized OutputRows boundary.
Elapsed-time, running-badge, surrounding layout and callback changes no longer traverse the
unchanged output array, while execution chrome remains responsive. This extends the earlier
per-row memoization: it avoids building the row element list itself when outputs are unchanged.
Changed output arrays still require O(n) row reconciliation and all visible output DOM remains
mounted; no virtualization claim follows.

A 1000-row regression failed before the change because clock/status updates called the array
map twice. It now observes no further row traversal while confirming the Running badge updates.
All 47 CodeCell tests pass (`/tmp/notebook-output-list-after.log`); `git diff --check` passes.
Full-suite/build gates predate this follow-up.
