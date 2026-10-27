# Editor optimization status

This is a use-case audit, not a claim of optimality or completion. Detailed chronological evidence
is in [EDITOR_SYNC_STORAGE.md](./EDITOR_SYNC_STORAGE.md).

## Current behavior and remaining gaps

| User scenario | Implemented / verified | Remaining scope |
| --- | --- | --- |
| Append execution results without rebuilding existing output | Stable canonical snapshots and cached projections preserve rows; memoized rendering skips unchanged ANSI parsing; real store-to-DOM append tested | Full output list traversal, transport serialization and offscreen output virtualization |
| Render independent text/image results correctly | ANSI state isolated per output; changed image URL starts a fresh error lifecycle | Real image network/decode audit; arbitrary output payload coverage |
| Append generated Markdown or code | New cells publish complete text without an empty intermediate body; shared lexer distinguishes headings, hashtags and indented code | Leading-heading recognition still lexes source |
| Break a code fence, repair it, return to preview | Literal source transitions; empty/nested fences, Unicode, delimiter growth, undo and reload coverage; native fence editing previously verified | Exhaustive source-format fidelity and native OS input-method coverage |
| Edit a long notebook without mounting every code editor | Deferred code editors; offscreen suspension retains history, selection, folds and height; focus/composition/DOM selection pinning | Whole-document/cell virtualization and end-to-end memory/latency targets |
| Receive separated external cell updates | Shared changed-run planner avoids replacing untouched middle cells; structural edits use LIS anchors | Whole-document projection remains O(n); many ProseMirror steps have additional costs |
| Keep a selection while cells move and text changes | Endpoint ownership, direction, contiguous text-change mapping, moved-image NodeSelection and whole-document AllSelection are tested | Native cross-cell drag selection; precise mapping between multiple disjoint edits within one block |
| Indent a short source selection inside a long line | Replacement excludes the unselected tail; outdent preserves endpoint mapping while removing the whole indentation prefix | Native textarea publication still materializes full text; not constant-time typing |
| Edit notebook source, navigate away, then resume | Draft/history retained in memory; actual Chrome restores a 500-line draft, backward selection and 6000px scroll position without applying it | Refresh/crash recovery; durable draft storage and bounded retention |
| Add cells in source, undo, redo, or branch | Stable boundary identities and types verified across history branches | Append metadata grows with total additions during the session; reclaim only in coordination with history retention |
| Render diagrams and recover after a malformed diagram | Serialized Mermaid configuration/rendering, queued cancellation, viewport deferral; native flowchart, sequence, state, class, Gantt and pie checks pass | Screenshot-level quality across engines, all grammar variants, interruption of a hung active library render |
| Open files from one notebook in a large local database | Uses notebookId index, one readonly transaction for requested metadata/content; native isolation by notebook verified | Pagination and representative wall-clock/heap benchmarks; full requested bodies are still materialized |
| Read/update a file while other operations are queued | Transaction-local metadata/content access; native 20-pair update/read ordering, delete-before-update and two-store rollback verified | Cross-tab edit conflict detection/resolution, not just transaction serialization |
| Store an oversized file | Metadata-only policy requires a supplied nonblank remote reference; obsolete local content is evicted with metadata update; forceLocal preserved | Remote reference availability is not validated; native verification of this specific eviction transition |
| Save an entire notebook and survive a partial failure | Single autosave writer; notebook metadata, activity, file metadata and body commit together; native injected-failure rollback and retry verified | Saves remain O(snapshot bytes); cross-tab stale revisions still need conflict handling |

## Next work, by concrete failure risk

1. Design durable source drafts around their base revision and boundary identities. Restoring
  text alone against a different live notebook must not silently overwrite intervening edits.
   Installed CodeMirror already trims undo events (100 plus an amortized margin); this
   is not a byte budget. Coordinate any appended-boundary metadata reclamation with
   both undo and redo reachability rather than deleting identities absent from current text.
2. Measure long-notebook input, scroll and heap behavior before choosing full virtualization
   boundaries. Preserve native selection, IME, undo and stable scroll height as acceptance criteria.
3. Define cross-tab conflict semantics explicitly. Serializing IndexedDB requests does not
   prevent a stale tab from replacing a newer logical document revision.

## Verification boundaries

- Latest full suite: **868 tests / 104 files passed**, exit 0 in 63.77s
  (`npx vitest run --maxWorkers=2`, `/tmp/notebook-heading-integrated-full.log`).
  No build ran concurrently and test timeouts were unchanged. This includes the aggregate
  snapshot migration, which also has native rollback/retry evidence.
- Model/component suites establish covered invariants, not complete browser behavior.
- The isolated Chrome audits use temporary profiles and fixtures, not the user's live notebook.
- The most recent whole-project typecheck failed with 305 diagnostics
  (`/tmp/notebook-heading-integrated-types.log`). Ignoring diagnostic coordinates,
  no diagnostic text was added/removed versus `/tmp/notebook-formula-integrated-types.log` (305).
  Formula save now uses the editing handler's payload/context parameters, eliminating
  two unused-parameter occurrences; identical diagnostic text still exists in the idle handler.
  The first check found two new test-only Array.at target-library errors; indexed
  access removed them without changing compiler targets. The project is still not type-clean.
- Production build passed in 31.85s (`/tmp/notebook-heading-integrated-build.log`).
  This does not meet a performance budget: NotebookApp remains 1827.74 KB minified / 588.81 KB gzip,
  and oversized-chunk warnings remain.
- No claim that these changes achieve globally optimal algorithms, constant-time typing,
  constant-space document loading, or complete delivery is supported yet.

### Execution and presentation mutation gate

CodeEditor now derives its read-only flag and custom change/keyboard callback attachment
from one predicate covering notebook read-only, execution and DSLC presentation modes.
Previously the latter two states disabled CodeMirror editing but retained custom mutation
callbacks. Two parameterized regressions failed before the fix and verify disconnection
and restoration after each mode transition. The CodeCell gate passes 69 tests / 11 files
(`/tmp/notebook-editor-lock-after.log`). These are component callback-contract tests,
not native keyboard or OS IME evidence. No additional traversal or cache was introduced.

### Source history retention evidence

A model integration regression appends 300 alternating raw/code cells, traverses the
entire retained undo window and redo window, then branches after undo. At each step it
decodes the real boundary-marked document and checks ordered cell identities. The undo
window is between 100 and 122 events with the installed dependency; branching discards
redo without reusing the removed cell's identity. All 41 tests in SourceDraftHistory,
NotebookSourceDocument and NotebookSourceDraftRegistry pass
(`/tmp/notebook-history-retention.log`). This verifies existing event-count trimming
and identity integrity, not bounded heap usage: individual events can be large and
appended-boundary metadata still lives until session release. No production retention
policy was changed by this verification.

### Source cell insertion publication

Adding Python, Markdown or raw sections now publishes the known appended range through
the same textarea range/selection helper used by history and indentation, instead of
leaving React to assign the full value. Three regressions failed before the change;
they now verify exactly one tail-range write, zero textarea value-setter calls, focused
collapsed selection, unchanged live notebook and undo/redo round trips. The 75 tests in
NotebookSourceButton, SourceDraftHistory and NotebookSourceDocument pass
(`/tmp/notebook-source-append-final.log`). Boundary validation and full source-string
construction still scale with document size; no constant-time append or native-browser
latency improvement is claimed from this component gate.

### Mermaid source-presence check

Preview rendering and scheduling share one memoized non-whitespace predicate instead
of independently trimming source. The predicate stops at the first non-whitespace
character, retains only a boolean, and is recomputed when source changes (subject to
React memo-cache lifecycle). Whitespace-only input remains O(source length); Mermaid
parsing/layout complexity is unchanged. Tests cover ASCII/Unicode whitespace-only
input and forwarding nonblank source without stripping surrounding whitespace.
The preview, render-service and Mermaid node-view suites pass 36 tests / 3 files
(`/tmp/notebook-mermaid-source-presence.log`), including existing stale-result and
queued-unmount coverage. This is not a measured rendering-latency improvement.

### Stale source-transition positions

Fence breaking, opening code source and returning source to preview now share a
checked position lookup. A document shortened after a NodeView captured its position
previously caused `nodeAt` to throw; these commands now return false without dispatch.
Three regressions failed before the fix. They cover a real previously valid position
after document replacement, negative/end positions and nonfinite/fractional numbers,
and assert unchanged editor-state identity and zero dispatched transactions.
The source-transition, MarkdownSourceCell and fenced-code extension suites pass
83 tests / 3 files (`/tmp/notebook-source-position-after.log`). The bounds check is
constant-time and does not replace the existing cell-identity ownership check.

### Initial notebook bundle attribution

A read-only Vite build (`build.write=false`) inspected Rollup's actual NotebookApp
chunk module map (`/tmp/notebook-bundle-module-audit.log`, exit 0). Largest rendered
module contributions, before final chunk minification/compression:

| Module | Rendered bytes |
| --- | ---: |
| KaTeX | 608628 |
| CodeMirror view | 459184 |
| CodeMirror state | 144166 |
| DOMPurify | 132979 |
| dnd-kit core | 102924 |

These are attribution figures, not transfer sizes or parse-time measurements.
KaTeX is statically reachable through both LaTeXView and markdownPreviewPlugins
(rehype-katex), with MarkdownCell, HybridMarkdown and CodeDisplay consuming the latter.
Deferring only LaTeXView cannot remove KaTeX from the initial notebook dependency graph.
The next loading optimization should unify optional math rendering ownership across
these consumers, preserving raw source while loading and handling failure/retry, then
verify the resulting graph and first-use behavior. CodeMirror similarly has several
static consumers; chunk naming alone is not evidence of deferred loading. No loading
behavior was changed by this audit.

### Optional math engine implementation

MathRenderService now owns one shared dynamic engine load, resetting only failed
loads for retry. The dynamically loaded renderer also owns KaTeX CSS. MarkdownCell,
HybridMarkdown, CodeDisplay and LaTeXView use the same asynchronous rendering path;
the synchronous rehype-katex pipeline was removed. Markdown AST math classes select
inline/block rendering while ordinary literal code and Mermaid routing are preserved.
Pending/failed previews retain source; rendering failures expose explicit retry. Hook cleanup
cancels ownership, and cancelled requests waiting on engine loading skip parsing.
No global formula/output cache or formula source mutation was introduced.

The production dependency audit recursively traversed NotebookApp's static imports
and found **zero KaTeX modules**. Its JS fell from 2101.87 to 1825.93 KB minified and
670.01 to 587.93 KB gzip. The optional KaTeX chunk is 265.45 KB / 77.50 KB gzip;
math CSS is 28.79 KB / 8.00 KB gzip. These assets are deferred, not eliminated.
This proves graph separation, not browser first-input timing or full virtualization.
The component/service tests cover shared loading, load retry, parser failure isolation,
cancel-before-load, stale result suppression, unmount, source preservation, empty
input, real inline/display math and literal code. Full suite passes as recorded above.
Representative latency remains to audit. Native loading/failure evidence follows.

### Native math loading and browser module-failure cache

An isolated Chrome profile (`/tmp/notebook-math-audit.5oeTsN`) on the real local app
confirmed no mathRenderer/KaTeX requests before adding formulas. Blocking the module
request revealed that Chrome retains the failed dynamic import: simply clearing our
promise and calling import again did not recover after unblocking. The initial native
audit therefore failed despite mocked loader-retry tests passing.

PreviewEngineLoadError now distinguishes engine acquisition from formula rendering.
Shared error UI preserves source and asks users to save work before refreshing for
engine-load failures; it does not automatically refresh or offer a ineffective retry.
Formula-render errors retain retry. The corrected browser audit blocked loading,
verified source and the reload notice with no retry button, then unblocked and refreshed:
two actual KaTeX formulas rendered, one display formula, zero failure buttons.
`/tmp/notebook-math-loading-audit.mjs` exited 0. This used isolated notebook fixtures,
not the user's live notebook, and did not verify draft persistence across refresh.
The targeted math/HybridMarkdown gate passes 18 tests / 3 files
(`/tmp/notebook-math-load-failure.log`). The earlier full suite/build predate this
error-classification follow-up. Native production-CDN loading and timing remain unverified.

### Shared preview-engine failure classification

Mermaid's top-level module acquisition now uses the same PreviewEngineLoadError as
math, replacing the math-specific error class rather than retaining parallel types.
MermaidPreview requests a save-before-reload on engine acquisition failure and keeps
retry for render/configuration failures. New tests verify load classification and the
UI transition from load failure to a retryable syntax failure on changed source.
All 30 tests across both preview components and both engine services pass
(`/tmp/notebook-preview-load-errors.log`). This does not classify Mermaid's internal
lazy diagram imports separately, nor does it provide native browser evidence for
every diagram family. The native module-cache observation above was obtained through
the math path; Mermaid's new branch has service/component coverage in this gate.

### Coalesced formula editing

LaTeX editing now requests a 180 ms deferred preview through useMathPreview. Each
source change cancels the preceding timer; unmount cancels pending work. Leaving
editing renders the latest pending source immediately, while an already matching
result is reused without parsing again. Static Markdown formulas remain immediate.
This reduces parses during a typing burst, not the complexity of one KaTeX render,
and cannot interrupt synchronous parsing already underway.
Fake-timer hook regressions cover consecutive edits, immediate flush, ready-result
reuse and unmount cancellation. The hook, math preview/service and HybridMarkdown
gate passes 20 tests / 4 files (`/tmp/notebook-math-edit-coalescing.log`). Native IME,
typing latency and geometry across the debounce interval remain unverified.

### Formula input-method keyboard boundary

LaTeXView now uses the existing shared composition-input predicate before handling
Enter/Escape. Four component regressions reproduced unwanted preventDefault and
save/cancel for isComposing or keyCode 229 events before the fix. They verify no
attribute writes/FSM transitions during composition and normal Enter save afterward;
a separate case retains normal Escape cancellation. The LaTeXView, MathPreview,
useMathPreview and MathRenderService gate passes 14 tests / 4 files
(`/tmp/notebook-formula-ime-after.log`). The view wrapper/FSM and rendering hook are
mocked in the keyboard regression; this is not native OS IME or blur-order evidence.

### Formula focus ownership

Removed LaTeXView's zero-delay focus timeout. A layout effect now initializes the
editing value and focuses the committed input directly, leaving no application-owned
deferred focus task. The regression failed before this change. Its first timer-count
assertion after the change also counted jsdom's own focus/select scheduling; the final
test stubs focus to verify its synchronous target and application timer ownership
without conflating that harness behavior. The formula view/hook/preview gate passes
12 tests / 3 files (`/tmp/notebook-formula-focus-final.log`). Native scroll/focus and
input-method blur ordering are not established by this mocked scheduling test.

### Formula save ownership

Formula attribute writes now belong to LaTeXModel's editing-state SAVE handler,
instead of running unconditionally in the view before sending SAVE. The view sends
the draft as event payload. Once SAVE or CANCEL reaches idle, a subsequent blur SAVE
cannot overwrite source or repeat a write; another EDIT starts a valid new session.
Missing payload does not end editing, while an intentionally empty formula is valid.
Real FSM model tests plus view event-contract tests pass 9 tests / 2 files
(`/tmp/notebook-formula-save-state.log`). This verifies state ownership and delayed
event sequencing, not native browser blur/composition event ordering.

### Unchanged formula save

The editing-state SAVE handler now compares the submitted string with the current
FSM context's node attribute before writing. An unchanged save still exits editing
but performs no attribute update. The regression failed before the change and also
checks a replaced context, avoiding comparisons against an obsolete initial node.
Changed content and explicit empty-string saves remain supported. The formula model,
view, hook and preview gate passes 16 tests / 4 files
(`/tmp/notebook-formula-noop-after.log`). This avoids redundant attribute writes;
string equality may still cost O(formula length), and no constant-time claim is made.

### Viewport-gated first formula rendering

MathPreview and rich LaTeXView now share usePreviewStart, subscribing to the existing
single IntersectionObserver until the first near-viewport notification (300px margin).
Editing forces immediate admission; after admission the observer subscription is
released and completed formula geometry remains mounted. useMathPreview does not
load/parse while inactive. This defers initially unseen work, not all later offscreen
edits, and is not memory-bounded virtualization: previously seen output stays retained.

A 100-formula component regression admits 10 and observes exactly 10 render calls,
90 source placeholders, stable rendered output on exit and observer disconnection on
unmount. Existing formula fixtures needed explicit visible/no-observer conditions;
their previous generic observer mock never emitted intersections. The five-file gate
passes 28 tests (`/tmp/notebook-math-viewport-verified.log`); the force-editing admission
test also passes (`/tmp/notebook-preview-start.log`). Native geometry, scroll latency,
printing and whole-document selection behavior remain to validate for this change.

### Native 200-formula viewport audit and unresolved smooth navigation

Isolated Chrome with the actual local app rendered 4 of 200 rich formulas initially.
An instant jump to the last formula raised the total to 9; returning to the first
retained the exact last KaTeX DOM node. `/tmp/notebook-math-scroll-audit.mjs` exited 0.
The temporary browser profile was `/tmp/notebook-math-scroll.OSRbGd`; fixtures were
isolated from the user's notebook. These counts prove first-render deferral, not a
wall-clock/heap budget or complete cell virtualization.

The preceding default scrollIntoView audit **failed**: the scroll-smooth container
traversed intermediate formulas, rendering 96, and ended with the target still 4745px
below the viewport as formula geometry expanded. Instant navigation was deliberately
tested separately and does not resolve this failure. MainContentArea applies
scroll-smooth; heading/outline navigation must account for changing preview geometry
or explicitly choose stable instantaneous navigation. This remains an actionable
editing/navigation issue, along with print and whole-document selection validation.

### Outline navigation implementation

PhaseSection now uses one lifecycle-owned heading navigation hook. It resolves the
exact heading (or its existing base/key attributes), lets scrollIntoView select real
ancestor scrollers, and explicitly uses instant positioning rather than traversing
deferred previews with smooth animation. Removed the guessed global overflow-container
lookup and unconditional 150ms fallback that redirected duplicate-heading selections
to the first unsuffixed heading. Scheduled animation frames are cancelled on a newer
request or unmount; attribute keys containing `--` are retained in full.

Three hook tests pass (`/tmp/notebook-outline-navigation.log`), covering duplicate
targets, supersession/unmount, attribute lookup and missing targets. Whole-project
typecheck remains at 305 diagnostics (`/tmp/notebook-outline-types.log`) with none in
the changed navigation or preview-start modules. Prior native instant-scroll evidence
supports the primitive, but clicking the actual outline in the browser has not yet
been re-audited. Global smooth styling and other callers remain unchanged; this does
not claim all smooth navigation or layout-shift issues are resolved.

### Shared outline heading identity

Notebook Markdown projection and PhaseSection now use nextHeadingIdentity for the
existing normalization/suffix scheme. Previously outline duplicate counting compared
raw titles, unlike the parser's normalized-key counting: case/punctuation differences,
non-Latin titles normalized to empty keys, and truncation collisions could disagree.
PhaseSection memoizes an ID-to-target map for regular steps, excluding the phase intro
which is represented by its base heading. Construction is O(total title characters)
with O(number of headings) entries; subsequent step target lookup avoids find/filter/
findIndex scans. Existing rendered heading URLs are preserved, not globally redesigned.

Cross-layer tests compare target IDs with actual parser output and cover phase-wide
counters and normalization. Parser/navigation/identity suites pass 18 tests / 3 files
(`/tmp/notebook-heading-identity.log`). Native outline clicking and the broader issue
of suffix-shaped literal slugs colliding with generated suffixes remain unverified;
the shared rule does not claim a globally collision-free anchor namespace.

### Outline component wiring regression

Added real PhaseSection button tests against headings produced by the notebook parser,
covering repeated text, case/punctuation normalization and different Chinese titles.
The phase intro deliberately shares the first subheading's text to verify it does
not shift subheading occurrence counts. Clicking the second heading selects its step
and scrolls only its rendered target, including after 500ms (past the removed delayed
fallback). Component/navigation/identity gates pass 9 tests / 3 files
(`/tmp/notebook-outline-component.log`). This closes component wiring coverage but
is still jsdom with scroll spies, not native scroll-position verification.

### Native integration counterexample: per-cell projection resets heading counts

The subsequent isolated native app audit found a counterexample to full outline
correctness: after setCells with one phase and two separate Markdown cells containing
`### Repeat` and `### repeat!`, both actual h3 elements had `id="phase--repeat"`.
The expected second target (`phase--repeat-2`) did not exist. Source inspection confirms
projectDocumentBlocks calls convertCellsToHtml([cell], ...) separately, and each call
creates a fresh headingSlugCounter. Tests sharing a parser counter or projecting one
combined source did not exercise this production integration path.

`/tmp/notebook-outline-native-audit.mjs` captured the heading IDs in the isolated
profile `/tmp/notebook-outline-native.ybXgt6`. No matching outline buttons were present
in that initial sidebar state, so native clicking remains unverified. This discovery
requires fixing phase-wide heading identity across incremental projection, including
reused nodes after heading edits/reordering, without reparsing all unchanged cells.
The earlier helper/component passes do not prove this requirement. No production
fix for this counterexample is claimed yet.

### Incremental cross-cell heading correction

projectDocumentBlocks now runs headingProjection for both reused and newly parsed
Markdown blocks, sharing phase counters across document order. Per-node weak entries
retain source heading text and heading-node references, including nested lists/quotes;
unchanged blocks do not repeat Markdown heading discovery. Only mismatched ID nodes
and their ancestors are copied, and no-heading/unchanged-ID blocks keep identity.
Reordering or renaming an earlier heading therefore updates downstream occurrences
without reparsing their cell HTML. First discovery still walks cell nodes and lexes
headed source; a changed-ID block is traversed to rewrite it, and each projection
counts/normalizes its headings. This is not constant-time whole-document synchronization.

The actual synchronization regression now covers separate same-phase cells, reorder,
rename and unrelated-node identity. Sync/performance/identity gates pass 45 tests
(`/tmp/notebook-heading-projection.log`), including existing 1000-cell one-cell-parse
checks; source-transition/application gates pass 68 tests
(`/tmp/notebook-heading-source-gate.log`). Typecheck remains 305 diagnostics with none
in headingProjection (`/tmp/notebook-heading-projection-types.log`). Native reproduction
has not yet been rerun after this implementation; full rich-heading syntax coverage
and globally collision-free literal suffix anchors remain open.

### Native heading projection and actual outline click verified

Re-ran the original separate-cell counterexample in isolated Chrome profile
`/tmp/notebook-heading-verify.oBVJwY`: actual h3 IDs were `phase--repeat` and
`phase--repeat-2`. Expanding the initially collapsed sidebar exposed the real outline
buttons. Clicking `repeat!` positioned the second heading at 327.20px in a 469px
viewport; after another 500ms it remained visible, while the first was at -1620.83px,
so the removed delayed redirect did not recur. Updating the first cell to `### Renamed`
produced `phase--renamed` and `phase--repeat` in the live editor.
`/tmp/notebook-outline-native-audit.mjs` exited 0 with assertions for IDs, real button
navigation and renumbering. This closes the recorded simple native counterexample,
not every rich-heading syntax, global suffix collision, or smooth-scroll caller.

### Heading cache normalization and richer syntax parity

Heading projection now retains the normalized (at most 80-character) base key per
heading, rather than rerunning lowercasing/regular expressions on raw heading text
every synchronization. Shared normalization and occurrence counting remain separate
functions used by the same identity rule. A direct model test proves one discovery/
normalization on first use, zero further calls across suffix correction and reuse of
the corrected node, with unrelated paragraph identity preserved.
Whole-document versus incremental projection parity now covers bold/entity/link
headings, blockquotes, nested list headings and levels 3/4. Sync/identity gates pass
46 tests (`/tmp/notebook-rich-heading-projection.log`); the cache test passes separately
(`/tmp/notebook-heading-cache.log`). This improves warm heading-key work without
claiming constant-time whole-document synchronization or exhaustive Markdown coverage.

### Heading phase reassignment verification

Extended cache and actual synchronization tests to move a heading to another phase
and then remove phase ownership. IDs correctly switch from phase-prefixed to new-phase
and cell-prefixed forms; unrelated paragraph nodes retain identity. The direct cache
test also confirms no rediscovery/normalization for these prefix-only changes.
The combined gate passes 44 tests / 2 files
(`/tmp/notebook-heading-phase-integration.log`). In the full synchronization pipeline,
samePresentation still reparses a Markdown cell when its phaseId changes; the direct
cache result must not be interpreted as zero-parse phase movement in the application.

### Phase metadata projection implemented

The follow-up removes phaseId mismatch as a reason to reparse unchanged Markdown
HTML. Heading projection now owns root phase metadata and level 1/2 base anchors as
well as level 3+ occurrence anchors. Phase-only changes reconstruct necessary markup
while retaining unchanged paragraph nodes and no-heading cell content fragments.
No-heading cells do not allocate a phase heading counter. First-use heading cache
discovery may still lex source; this is elimination of HTML reprojection, not a claim
of zero parsing in every cold-cache case.

A real synchronization regression spies on parseSlice and verifies zero calls for
headed/plain phase moves, updated root attributes/H2/H3 anchors, and retained content
identity. Sync, heading cache, source transitions and source-application gates pass
113 tests / 4 files (`/tmp/notebook-phase-metadata-projection.log`). Native phase moves
have not been rerun after this optimization; the previous native heading audit
predates this metadata-only update path.

### Phase projection selection preservation

Extended the real synchronization regression to hold a backward selection in a body
paragraph while updating phase metadata on two adjacent cells. After the update,
anchor/head offsets, backward direction and selected paragraph object are unchanged,
alongside the existing zero-HTML-parse and node-identity checks. All 44 document-sync
tests pass (`/tmp/notebook-phase-selection.log`). This establishes ProseMirror state
preservation for this case, not native focus, IME or viewport scroll behavior.

### Source history checkpoint foundation

SourceDraftHistory now exposes a versioned JSON checkpoint using CodeMirror's own
history field serialization and a restoring factory. A round-trip test covers Unicode,
backward selection, pending redo, complete undo, independent branching and rejection
of unsupported versions/invalid editor state. All 14 history tests pass
(`/tmp/notebook-source-history-checkpoint.log`). Checkpoint creation is explicit rather
than added to the per-keystroke path; serialization cost depends on document/history
size. This format is an internal versioned snapshot, not a cross-version interchange
guarantee for arbitrary future CodeMirror implementations.

No durable writer/UI recovery is connected yet. Full restoration must also preserve
NotebookSourceDocument's boundary token, added-cell identities and baseline semantics.
Its deleted-cell conflict check currently uses object identity, which does not survive
serialization; restoring history alone must not be mistaken for safely restorable
notebook drafts. The existing in-memory-only warning remains accurate and unchanged.

### Source document identity checkpoint

NotebookSourceDocument now offers an explicit versioned checkpoint retaining the
boundary token, original baseline cells and added-cell identities/types. JSON
round-trip regressions preserve old/new source sections and allow subsequent append
without identity reuse. Invalid versions, tokens, duplicate identities and boundary
collisions are rejected. Restored text edits preserve live outputs and unrelated
metadata; detached deletion still fails closed under the existing identity check.
The document, history and draft-registry suites pass: 46 tests in 3 files
(`/tmp/notebook-document-checkpoint.log`). The previous full-project gates predate
these checkpoint changes; they have not been rerun for this addition.

Checkpoint creation is opt-in, outside the keystroke path. It copies the baseline
array, not nested payloads: callers must provide immutable cells. Serializing it
costs proportional to the baseline payload (including outputs), and arbitrary output
values may not be JSON-safe. Storage encoding, size limits, durable writer, recovery
UI and serialized deletion-conflict semantics remain unresolved. No automatic
restore or persistence is enabled by this foundation.

### Source session restoration lifecycle

The session now checkpoints its notebook identity, document identity/baseline and
current draft together. Restoration starts editable and rechecks conflicts on apply;
it does not replay stale errors or publish automatically. Invalid boundary text is
preserved for repair rather than discarded at restore time. Applying/applied/cancelled
sessions cannot be checkpointed. Regressions cover wrong-notebook rejection, stable
added identities, unsaved subscription state, malformed draft repair and closed
session rejection. Document/session/registry suites pass 42 tests in 3 files
(`/tmp/notebook-session-checkpoint.log`); diff whitespace checks pass. This remains
model-level groundwork, with no durable writer or recovery UI enabled and no new
full-project gate for this addition.

### Atomic draft checkpoint envelope

The draft registry can now checkpoint/restore the session, CodeMirror history and
viewport together. Both capture and restoration reject source/history divergence.
Restoration constructs and validates the candidate before acquiring registry/unload
ownership and rejects replacing an existing open draft. Tests cover pending redo of
an added Python cell, backward selection, viewport, stable cell identity through apply,
unload protection and failed restoration leaving the existing draft untouched.
Registry/session/history suites pass 40 tests across 3 files
(`/tmp/notebook-draft-checkpoint.log`), with a clean whitespace check. This explicit
snapshot path is not part of typing or autosave; no disk persistence/recovery UI is
connected yet. Full-project gates and native recovery testing remain outstanding.
