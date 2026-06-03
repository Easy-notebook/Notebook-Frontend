The inventory matches the audit. I have everything I need to write the migration plan.

# Migration Plan: TipTap → ProseMirror-First Notebook Core

**Document status:** Plan / proposal
**Target:** Convert `Notebook-Frontend` from a Zustand-canonical, TipTap-derived editor into a framework-free, ProseMirror-first, externally-controlled notebook SDK (`@easynotebook`-grade container).
**Approach:** Strangler-fig. The new core (`NotebookEditorCore`) is built *alongside* the live TipTap editor. Nothing is cut over until the new path passes round-trip and behavioral parity tests. The editor is shippable at the end of **every** phase.

---

## 0. Target architecture (end state)

Three hard layers, each with an explicit, testable boundary:

| Layer | Package / dir | Depends on | Must NOT depend on |
|---|---|---|---|
| **Core** | `core/` → `NotebookEditorCore`, `NotebookDoc`, `NotebookCell`, `NotebookTransaction`, `NotebookCommand`, `NotebookSerializer` | `prosemirror-*` only | React, Zustand, i18n, `window`, `fetch`, CodeMirror app stores |
| **Adapter** | `adapter/` → `NotebookAdapter` (implements `NotebookStorePort`), executor/AI/upload/image-gen service ports | Core public API | React |
| **View shell** | `react/` → `ControlledNotebookEditor` + thin React wrappers | Core + Adapter | direct PM internals (only via core API) |

Core invariants:
- The **PM document is the single source of truth**. Any external `Cell[]` is a *projection* produced by `NotebookSerializer`, never a parallel master.
- All external mutation enters through `core.applyExternal(...)` carrying `tr.setMeta('fromExternal', true)`; all core→outside changes leave through a single `dispatchTransaction` interceptor. **No wall-clock `isInternalUpdate` locks.**
- Commands receive `ctx = { state, dispatch, view, services }`. They never import a store. AI/exec/upload/image-gen are reached through injected `services`.

Proposed PM schema nodes: `notebook` (doc) → `notebookCell+`; cell variants `markdownBlock`, `codeCell` (+ child `outputBlock`), `table`, `imageBlock`, `thinkingBlock`, `rawBlock`. Title is the first `markdownBlock`/`heading` with a `role: 'title'` attr (modeled explicitly, not heuristically).

---

## Phase 0 — Dead-code cleanup (no-risk, no behavior change)

**Goal:** Remove all unreferenced/experimental code so the true live surface is unambiguous before any schema work. Pure deletion; zero runtime path changes.

### Files to DELETE

**BlockManager (`src/components/Editor/TipTap/BlockManager/`)** — only `SimpleDragManager.tsx` is imported (by `TiptapNotebookEditor.tsx:31`). Delete the rest:
- `BlockManagerExtension.ts` — 0-byte stub. DELETE.
- `BlockManagerExtensionImproved.ts` — no importers. DELETE.
- `BlockToolbar.tsx` — only reachable from dead `SimpleTipTapBlockManager`. DELETE.
- `SimpleTipTapBlockManager.tsx` — no importers. DELETE.
- `DraggableBlockManager.tsx` — no importers. DELETE.
- `DragIndicator.tsx` — only used by dead managers. DELETE.
- `MinimalBlockManager.tsx` — no importers. DELETE.
- `SimpleDragBlockManager.tsx` — no importers. DELETE.
- `StableBlockManager.tsx` — no importers. DELETE.
- `useBlockManager.ts` — no importers. DELETE.

**Duplicate / shadowed extensions (`src/components/Editor/extensions/`)** — the barrel `index.ts` resolves the live ones to `implementations/*`:
- `CodeBlockExtension.tsx` (top-level, 453 LOC) — dead duplicate of `implementations/CodeBlock/CodeBlockExtension.ts`. DELETE.
- `LaTeXExtension.tsx` (top-level, 715 LOC) — dead duplicate of `implementations/LaTeX/LaTeXExtension.ts`. DELETE.
- `katex-extension.js` — no importers (LaTeX handled by `implementations/LaTeX/LaTeXView`). DELETE.
- `mermaid-extension.js` — no importers. DELETE.
- `SlashCommandExtension.tsx` — exported from barrel but never wired into `getTipTapExtensions`. DELETE (PM slash trigger is rebuilt natively in Phase 4).

**Dead slash / keyboard systems:**
- `src/components/Editor/SlashCommands/useSlashCommands.ts` — never imported. DELETE.
- `src/components/Editor/SlashCommands/SlashCommandMenu.tsx` — only used by the dead hook above. DELETE (whole `SlashCommands/` dir).
- `src/components/Editor/KeyboardShortcuts/useKeyboardShortcuts.ts` — never imported; advertised save/undo/run shortcuts are not actually wired. **Mine its shortcut list into a note first**, then DELETE.

### Files to MINE-THEN-DELETE later (keep until referenced phase)
- `src/components/Editor/KeyboardShortcuts/ShortcutsHelp.tsx` — only used by `JupyterNotebookEditor`. KEEP until Phase 8 (Jupyter editor removal), then DELETE.

### Mechanical hygiene (same phase, low risk)
- Strip committed `DEBUG=true` / `console.log` noise in `cellConverters.ts`, `markdownConverters.ts`, `useEditorSync.ts`, `useEditorEvents.ts`, `TiptapNotebookEditor.tsx`, `notebookStore.ts`, `codeStore.ts`. Gate any survivors behind a `debug()` util.
- Remove the cells-change `console.log` effect in `TiptapNotebookEditor.tsx` (lines ~84-90).

**Files touched:** ~22 deletions + barrel edits to `extensions/index.ts` (drop `SlashCommandExtension`, dead `CodeBlock`/`LaTeX` re-exports).

**Exit criteria / tests:**
- `tsc --noEmit` clean; `eslint` no new unused-import errors.
- `grep -r` confirms each deleted symbol has 0 importers (run before each delete).
- App boots; create-mode editor renders, slash menu opens, drag handle works, a code cell executes. (Smoke test — no behavior should change at all.)

**Risk:** Very low. Only risk is deleting a file with a hidden importer.
**De-risk:** Delete in small commits grouped by subsystem; run `tsc --noEmit` + smoke test after each group.
**Rollback:** `git revert` the delete commit.

---

## Phase 1 — Core scaffold (`NotebookEditorCore` skeleton, off the live path)

**Goal:** Stand up the framework-free core package with a trivial schema, an `EditorState`/`EditorView` it owns, and the external-control contract — **not yet mounted anywhere**. Built and unit-tested in isolation.

**New files (`src/components/Editor/core/`):**
- `NotebookEditorCore.ts` — owns `EditorState` + optional `EditorView`; exposes `applyExternal(intent)`, `getDoc()`, `on('change', cb)`, `commands`, `dispatchTransaction` interceptor that classifies *structural vs content* change and tags `fromExternal`.
- `NotebookDoc.ts` — thin OOP wrapper over the PM doc (read-only queries: `cells()`, `cellById(id)`, `title()`).
- `NotebookCell.ts` — OOP accessor over a single cell node (id, type, attrs).
- `NotebookTransaction.ts` — typed wrapper over PM `Transaction` (meta helpers: `fromExternal`, `noHistory`).
- `NotebookCommand.ts` — `type NotebookCommand = (ctx: CommandCtx) => boolean` + `CommandCtx` interface (`state, dispatch, view, services`).
- `ports.ts` — `NotebookStorePort`, `ExecutorService`, `AIStreamService`, `UploadService`, `ImageGenService` interfaces (implementations come later).
- `schema.minimal.ts` — temporary `notebook > (markdownBlock | rawBlock)+` schema to exercise the plumbing.

**Files touched:** none of the live editor. Pure additions.

**Exit criteria / tests:**
- Unit tests: create core, dispatch a text edit, observe a `change` event with correct structural/content classification.
- `applyExternal` produces a transaction tagged `fromExternal`; the change interceptor does **not** re-emit for `fromExternal` transactions (echo-loop prevention proven by test, no timers).
- Core module has **zero** imports of React/Zustand/`window`/`fetch` (enforced by an ESLint `no-restricted-imports` rule on `core/`).

**Risk:** Low (isolated).
**Rollback:** Delete `core/`; nothing else references it.

---

## Phase 2 — Schema + serializer with AST round-trip tests (the keystone)

**Goal:** Define the full PM schema and a real, lossless **mdast (remark) ↔ PM** serializer (`NotebookSerializer`), plus a `Cell[] ↔ doc` codec for legacy interop. This replaces all four current hand-rolled conversion paths. Still off the live path.

**Schema nodes (`core/schema.ts`):** `notebook`, `notebookCell` (generic wrapper if needed), `markdownBlock`, `codeCell` (attrs: `cellId`, `language`, `enableEdit`, `displayMode`; editable code as text content), `outputBlock` (atom, `selectable:false`, attr `{ items:[{kind,data,mime?}], status:'ok'|'error'|'empty', executionCount? }`), `table`/`tableRow`/`tableCell` (native PM, alignment preserved), `imageBlock`, `thinkingBlock` (real persisted attrs: `agentName`, `textArray`, `customText`), `rawBlock`. Title = first block with `role:'title'`.

**Serializer (`core/NotebookSerializer.ts`):**
- `parseMarkdown(md): Doc` via `remark-parse` + `remark-gfm` + `remark-math` + `remark-frontmatter` + `remark-directive` (for custom blocks like `:::thinking`).
- `serializeMarkdown(doc): md` via `prosemirror-markdown` custom serializer / `remark-stringify`, with **centralized escaping** (fixes the current unescaped-innerHTML hazard).
- `docFromCells(cells): Doc` / `cellsToDoc` + `cellsFromDoc(doc): Cell[]` — the legacy interop codec replacing `convertCellsToHtml` / `convertEditorStateToCells`.
- Custom-node markdown representation: fenced/directive syntax for `thinkingBlock`, `rawBlock`, `imageBlock`, code outputs — so export is no longer lossy.

**Files referenced / replaced (not yet deleted):**
- `src/components/Editor/utils/markdownConverters.ts` — logic superseded; mark **PORT→DELETE** at cutover.
- `src/components/Editor/utils/cellConverters.ts` — superseded; **PORT→DELETE** at cutover.
- `src/components/Editor/utils/markdownParser.ts` (import splitter) — **PORT** its title/heading-level intent into `parseMarkdown`.
- `src/utils/markdownParser.ts` (`parseMarkdownCells` outline builder) — **PORT** into a *derived* outline plugin (Phase 6), removing per-mutation regex in the store.

**Exit criteria / tests (this is the gate — invest heavily here):**
- **Golden round-trip corpus**: a fixtures dir of real notebooks (incl. GFM tables w/ alignment, nested + ordered + task lists, fenced code inside markdown, inline vs block math, frontmatter, thinking/raw/image custom blocks, escaped `\|` in tables, `<`/`&`/quotes in text). Assert `md → doc → md` is stable (idempotent) and `doc → md → doc` is structurally equal.
- **Legacy parity**: for a sample of existing IndexedDB `{cells,tasks}` snapshots, assert `cellsFromDoc(docFromCells(cells))` preserves ids, outputs, metadata, phaseId (the lossy-output problem the current `mergeCellsWithStore` works around must now be lossless because outputs live in the doc).
- Property test: random doc → md → doc round-trips without throwing or dropping nodes.

**Risk:** Medium. This is where correctness lives.
**De-risk:** Build the golden corpus *first* from real user notebooks; treat any non-idempotent fixture as a blocking bug. Keep the old converters running in parallel so a "differ" harness can compare old-vs-new output during development.
**Rollback:** Serializer is unreferenced by live code; delete or pin.

---

## Phase 3 — Command registry (single source for slash/toolbar/keyboard)

**Goal:** Build the injectable `CommandRegistry`. One registry; slash menu, bubble menu, and keymap all *render/dispatch from it*. Commands operate on PM transactions; business actions go through injected `services`. Still consumed only by the new core (no live cutover).

**New files (`core/commands/`):**
- `CommandRegistry.ts` — `register/get/list/filter(group|keywords)`; `Command = { id, title, description, icon, keywords, group, isAvailable?(ctx), isActive?(ctx), run(ctx) }`.
- `builtins/*` — insert/format commands: paragraph, headings, lists, quote, `codeCell`, `table`, math, `imageBlock`, `rawBlock`, `thinkingBlock`, bold/italic/strike/code/blockquote. **Centralize node-type-name constants** here (removes hardcoded `'executableCodeBlock'`/`'thinkingCell'`/`'rawBlock'` strings).
- `services.ts` — `executeCell(cellId)`, `cancel(cellId)`, `uploadImage(file)`, `generateImage(params)`, `streamInto(cellId)` — injected at core construction.

**Source of truth being consolidated (PORT unique ideas, then these get cut over/deleted):**
- `TipTap/TipTapSlashCommands.tsx` (13 inline commands) — **PORT** command definitions into registry; component becomes a thin view in Phase 4.
- `TipTap/components/BubbleMenu.tsx` — **PORT**: replace inline `editor.chain()` calls with `registry` + `isActive(ctx)`.
- `KeyboardShortcuts/useKeyboardShortcuts.ts` (already deleted Phase 0) — its mined shortcut list (save/undo/redo/run/command-palette) becomes registry ids + keymap entries.
- `SlashCommandMenu.tsx`'s unique `ai-generate` command — **PORT** into registry as an injected-service command.

**Exit criteria / tests:**
- Unit tests: each builtin command runs against a fresh core state and produces the expected doc; `isActive`/`isAvailable` correct.
- A keymap maps ids → commands; dispatch-by-id works.
- `services` are mockable; an `executeCell` command calls the injected mock, never a store.
- Registry has zero React/Zustand imports.

**Risk:** Low–medium.
**Rollback:** Registry unreferenced by live editor; delete.

---

## Phase 4 — View adapter: `ControlledNotebookEditor` (parallel mount behind a flag)

**Goal:** Wrap the core in a thin React shell and mount it **behind a new `editorType: 'pm'`** alongside the existing tiptap/jupyter options. Both editors over the same store; users opt in. This is the first time core code runs in-app.

**New files (`react/`):**
- `ControlledNotebookEditor.tsx` — mounts `core.view` into a div (replaces `EditorContent`); `useEffect(() => core.applyExternal(cells), [cells])` for inbound sync (replaces `useEditorSync`); subscribes to `core.on('change')` → `port.setCells/updateCell` for outbound (replaces `useEditorEvents`). Keeps genuine view concerns: i18n placeholder, imperative ref API, `EditorCover`.
- Thin React wrappers around core view state for: slash menu (subscribes to a PM slash-trigger **plugin** state, not document-capture keydown listeners), bubble menu, drag handle.
- `SlashTriggerPlugin` (in `core/`) — owns menu open/query/position via plugin state; React menu is a view.

**Settings wiring:**
- `src/store/models/settings.ts:14` — extend union to `'tiptap' | 'jupyter' | 'pm'`. **PORT.**
- `src/components/Scenario/View/CreateMode.tsx` — add a third branch mounting `ControlledNotebookEditor`. **PORT.**

**Adapter (`adapter/`):**
- `NotebookAdapter.ts` — implements `NotebookStorePort` against the existing `notebookStore` (`getCells/setCells/updateCell/setCurrentCell/setEditingCellId`). The core stays store-agnostic; this is the only file that knows Zustand.

**Cross-cell navigation:** reimplement as PM keymap commands + gapcursor/selection in core. **Drop** `window` `'markdown-cell-focus'`/`'cell-navigation'` CustomEvents and `doc.descendants` position math from `TiptapNotebookEditor.tsx:176-257`.

**Exit criteria / tests:**
- With `editorType:'pm'`, the editor loads an existing notebook (via `applyExternal`/`docFromCells`), edits sync back to the store, autosave fires, no echo loop (proven by transaction-meta, no timers).
- Slash menu, bubble menu, keyboard nav, drag reorder all work via registry/plugins.
- Side-by-side manual diff vs tiptap editor on the golden corpus: visual + serialized parity.

**Risk:** Medium. First real integration; reentrancy is the classic failure.
**De-risk:** Keep tiptap as default; `pm` is opt-in. The transaction-meta echo guard (vs the old `setTimeout` locks) is unit-tested in Phase 1 before it ever runs here.
**Rollback:** Switch default back / hide the `pm` option; tiptap path untouched.

---

## Phase 5 — Per-cell node migration (NodeViews owned by PM, not the store)

**Goal:** Make each cell a real PM node whose NodeView is driven by **node attrs**, not `useStore.getState()`. The existing `./Cells` React components are reused as *presentational* renderers fed by props/attrs.

**Files PORTED (invert store-coupling → attr/prop-driven):**
- `extensions/implementations/CodeBlock/{CodeBlockExtension.ts, CodeBlockView.tsx, CodeBlockModel.ts}` — code text becomes PM node content; `CodeBlockView` stops reading `cells.find()` from Zustand and reads node attrs; CodeMirror NodeView owns the buffer synced via PM transactions. **PORT.**
- `extensions/implementations/Image/*`, `LaTeX/*`, `ThinkingCell/*` — **PORT**: ImageView stops pulling `{cells,updateCell,viewMode}` from `useStore`; thinking attrs become real persisted node attrs.
- `extensions/core/BaseExtension.ts` — **PORT** the atom-block-with-`cellId` + `ReactNodeViewRenderer` pattern as the core NodeView base; **drop** vestigial `fsmState`.
- `extensions/core/ExtensionFSM.ts` — vestigial, no live consumer. **DELETE.**
- `extensions/{FileAttachmentExtension, RawCellExtension, TitleExtension, TitleNodeView, UploadDropExtension, TableExtension}.tsx` — **PORT** into core node specs (Title becomes the `role:'title'` node; UploadDrop becomes a PM plugin calling injected `UploadService`).
- `Cells/*` React components + their ViewModels — **KEEP** as presentational views, but **PORT** `BaseCellViewModel.ts` / `CodeCellViewModel.ts` to receive an injected model/port instead of `useStore.getState()`.

**Stable identity:** guarantee `cellId` uniqueness/persistence across split/merge/paste via a PM plugin (`appendTransaction` that stamps missing ids) — required because async streaming resolves targets by `cellId`.

**Exit criteria / tests:**
- A code cell renders, edits, and persists with **no** Zustand read in its NodeView (enforced by an import-lint on `core/`/NodeView files).
- Split/merge/paste preserves unique `cellId`s (unit test on the id plugin).
- Outputs render from the `outputBlock` node attr; structured `status` field replaces the `[error-message-for-debug]`/`[without-output]` sentinels; `showAIdebug` reads `status==='error'`.

**Risk:** High. Code cells + CodeMirror inside PM is the hardest UI seam.
**De-risk:** Migrate one node type at a time (rawBlock → image → thinking → markdown → **codeCell last**). Keep the tiptap NodeViews live until each PM equivalent passes.
**Rollback:** Per-node; revert the single node's commit, fall back to tiptap path.

---

## Phase 6 — Execution / AI streaming wiring (through injected services)

**Goal:** Route code execution, polling output, and AI streaming through injected `services` and PM transactions, with ephemeral runtime state out of the doc. Also move the Task/Phase/Step outline to a derived plugin.

**Files PORTED:**
- `store/codeStore.ts` — **PORT** `executeCell` to write outputs into the `outputBlock` node via transactions tagged `noHistory` (`addToHistory:false`); keep `isExecuting/elapsedTime/isCancelling` in a **PM plugin state / external ephemeral store keyed by cellId**, surfaced via decorations (never node attrs — too churny). Unify the two exec paths (`codeStore.executeCell` interactive + `useScriptStore.execCodeCell` workflow) behind the injected `ExecutorService`.
- `services/notebook/CodeExecutionService.ts` — **KEEP** but inject as `ExecutorService` impl (decouple schema from `fetch`/single-global-kernel).
- `services/stream/actions/*` (`AddContentToCellAction`, `TiptapUpdateAction`, `RunCurrentCodeCellAction`, `SetCellModeAction`, `UpdateCellMetadataAction`, `ClearOutputsAction`, `ExecNewVersionAction`) — **PORT**: content streaming becomes incremental `tr.insertText` at the node boundary (not whole-string read-modify-write); target resolution by stable `cellId`. `ExecAction` alias and `deserializeOutput` no-op — **DELETE.**
- `Cells/CodeCell/hooks/useCodeExecution.ts`, `useOutputProcessing.ts` — duplicate the ViewModel logic. **DELETE** (consolidate to one).
- Outline: **PORT** `parseMarkdownCells` (`src/utils/markdownParser.ts`) into a derived PM plugin that walks heading nodes; **remove** the per-mutation `parseMarkdownCells`/`updateCellsPhaseId` calls scattered through `notebookStore.ts`.
- AI prose answers (`AIAgentStore.qaList`, sidebar) — **KEEP as a side channel**, explicitly out of the document model.

**Display mode:** single `displayMode` node attr; **drop** the `codeStore.cellModes` vs `metadata.displayMode` dual-channel.

**Exit criteria / tests:**
- Execute a cell: partial outputs stream into the `outputBlock` with `addToHistory:false` (undo does not replay outputs — unit test on history).
- AI streaming appends incrementally without nuking selection/cursor (test cursor position stability under streamed inserts).
- Outline sidebar derives from heading nodes; store no longer recomputes tasks on every keystroke.
- `ExecutorService` is mocked in tests; both interactive and workflow execution hit the same command.

**Risk:** High (async + history + selection interactions).
**De-risk:** Land output-as-node first (read path) before switching the write path off the store. Test undo/redo + streaming explicitly.
**Rollback:** Keep store-writeback path behind a flag until the node path is proven.

---

## Phase 7 — Store / OOP adapter: make PM canonical, retire the bridge

**Goal:** Invert the source of truth. The PM doc (owned by an external OOP `NotebookModel`) becomes canonical; the Zustand `cells[]` array becomes a thin derived projection (or is dropped). Cut `editorType:'pm'` to default.

**Files PORTED / changed:**
- `store/notebookStore.ts` (1637 LOC) — **PORT**: cell CRUD becomes intent methods that dispatch PM transactions via `NotebookModel`; `cells` selector derives from the doc (or is removed). Delete `convertCellsToHtml`/`convertEditorStateToCells` call sites. Keep title↔`notebookTitle` two-way sync as a PM title-node rule.
- `store/models/cell.ts` — **PORT** `Cell`/`OutputItem` as the *projection* shape produced by the serializer; **DELETE** the underused `CellModel` class (its sentinel/sanitize logic moves into the serializer/output-status field). Narrow the `[key:string]:any` index signature.
- `Workflow/observation/state/Notebook.ts` — **KEEP** (separate server/agent-state mirror); do **not** build the editor model on its snake_case `NotebookCell`. Document the boundary.
- Workflow write paths (`addNewCellWithUniqueIdentifier`, `updateCellByUniqueIdentifier`, `DelegateTaskAction.ts`) — **PORT** to the `NotebookModel`/port API.
- Persistence: `services/autoSave/{AutoSaveService.ts, types.ts}`, `storage/notebookOrm.ts` — **PORT**: serialize the PM doc; add a **back-compat reader** that imports legacy `{cells,tasks}` IndexedDB snapshots via `docFromCells`. `notebookOrm` (metadata only) largely unchanged.
- `useBeforeUnload.ts`, autosave triggering, i18n placeholder — **KEEP in the React shell**, not the core.

**Cutover:** flip default `editorType` to `'pm'`.

**Exit criteria / tests:**
- Existing IndexedDB notebooks load via the back-compat reader and round-trip without loss (outputs/metadata/phaseId preserved).
- New saves are PM-doc format; reload is byte-stable.
- The 112 `notebookStore` importers compile against the new projection API (or are migrated); workflow agent writes land in the doc.
- No `convertCellsToHtml`/`convertEditorStateToCells` references remain.

**Risk:** Highest blast radius (112 importers, persistence format change).
**De-risk:** Ship the back-compat reader and a one-time migration in a *separate* commit before flipping the default. Dual-write (legacy snapshot + PM doc) for one release so rollback keeps data. Feature-flag the default flip.
**Rollback:** Flip default back to `tiptap`; legacy snapshots still readable thanks to dual-write.

---

## Phase 8 — Retire legacy editors + SDK packaging

**Goal:** Delete the now-dead tiptap and Jupyter editors and the obsolete bridge utilities; package the core as a portable SDK.

**Files to DELETE (after Phase 7 proves the PM path):**
- `src/components/Editor/TiptapNotebookEditor.tsx` — superseded by `ControlledNotebookEditor`. DELETE.
- `src/components/Editor/JupyterNotebookEditor.tsx` (729 LOC) — parallel non-PM editor. DELETE.
- `KeyboardShortcuts/ShortcutsHelp.tsx` — only Jupyter used it. DELETE.
- `TipTap/hooks/{useEditorSync, useEditorEvents, useBeforeUnload→relocate, useCellManagement, useLinkHandler, useKeyboardHandlers}` — bridge logic now in core/shell. DELETE or PORT remnants.
- `TipTap/config/{extensions.ts, editorPlugins.ts, index.ts}` — TipTap wiring obsolete. DELETE.
- `utils/{markdownConverters.ts, cellConverters.ts}` — replaced by `NotebookSerializer`. DELETE.
- `extensions/index.ts` barrel + remaining TipTap-only files — DELETE once all are ported.
- Remove `@tiptap/*`, `marked`/`turndown` (if confirmed unused outside PDF), and the `editorType:'tiptap'|'jupyter'` settings branches.

**SDK packaging:**
- Extract `core/` + `adapter/` + `react/` into a publishable `@easynotebook/*` workspace: `@easynotebook/core` (PM-only), `@easynotebook/react` (`ControlledNotebookEditor`), `@easynotebook/serializer`. Public entry exports `NotebookEditorCore`, `NotebookDoc`, `NotebookCell`, `NotebookTransaction`, `NotebookCommand`, `NotebookSerializer`, `NotebookAdapter`, `ControlledNotebookEditor`.
- Define service injection points (`ExecutorService`, `AIStreamService`, `UploadService`, `ImageGenService`) as the package's extension contract.

**Exit criteria / tests:**
- No `@tiptap/*` imports remain (`grep` gate).
- `@easynotebook/core` builds with **zero** React/Zustand deps; a minimal example app embeds `ControlledNotebookEditor` with mock services.
- Full golden-corpus round-trip + execution + AI-stream e2e pass on the packaged build.

**Risk:** Medium (deletion of large files; packaging).
**De-risk:** Delete only after a full release cycle on the `pm` default with no regressions.
**Rollback:** The legacy files are deleted last and independently; revert the delete commits if a gap surfaces.

---

## Riskiest cutovers & how to de-risk them

1. **Reentrancy / echo loop (Phase 4).** The current `isInternalUpdate` + `setTimeout(0/10/30/50ms)` locks are timing-fragile. *De-risk:* replace with `tr.setMeta('fromExternal', true)` + a single `dispatchTransaction` interceptor, unit-tested in Phase 1 *before* it touches the app. No wall-clock windows anywhere.

2. **Lossy serialization (Phase 2).** Outputs/metadata live only in `Cell[]` today, forcing `mergeCellsWithStore` re-fetches. *De-risk:* model outputs as `outputBlock` node attrs so the doc is lossless; gate the whole migration on the golden round-trip corpus being idempotent. Keep a old-vs-new differ harness running through Phase 4.

3. **Code cell + CodeMirror inside PM (Phase 5).** *De-risk:* migrate codeCell *last* among node types; CodeMirror NodeView owns its buffer synced via transactions; keep the tiptap codeView live until parity.

4. **Execution/streaming vs undo history & selection (Phase 6).** Many small output writes + token-by-token inserts can pollute history and destroy the cursor. *De-risk:* `addToHistory:false` for output/runtime writes; incremental `tr.insertText` (never whole-string replace); ephemeral exec state in plugin/external store, not node attrs; explicit undo+streaming+cursor tests.

5. **Source-of-truth inversion + 112 store importers + persistence format change (Phase 7).** *De-risk:* back-compat reader + one-time migration in a separate commit; **dual-write** legacy snapshot and PM doc for one release; feature-flag the default flip so rollback never loses data.

---

## Master file classification (quick index)

| File / dir | Class | Reason |
|---|---|---|
| `TipTap/BlockManager/SimpleDragManager.tsx` | KEEP→PORT | Only live drag manager; becomes PM-native NodeView dragging |
| `TipTap/BlockManager/*` (other 10) | DELETE | No importers / 0-byte / dead variants |
| `extensions/implementations/*` (CodeBlock, Image, LaTeX, ThinkingCell) | PORT | Canonical node set; invert store-coupling to attrs |
| `extensions/core/BaseExtension.ts` | PORT | NodeView base; drop `fsmState` |
| `extensions/core/ExtensionFSM.ts` | DELETE | Vestigial, no live consumer |
| `extensions/{CodeBlockExtension,LaTeXExtension}.tsx` | DELETE | Dead top-level duplicates (~1168 LOC) |
| `extensions/{katex,mermaid}-extension.js` | DELETE | No importers |
| `extensions/SlashCommandExtension.tsx` | DELETE | Exported but never wired |
| `extensions/{FileAttachment,RawCell,Title,TitleNodeView,UploadDrop,Table}` | PORT | Become core node specs/plugins |
| `extensions/index.ts` | DELETE (eventual) | TipTap barrel obsolete after cutover |
| `TipTap/TipTapSlashCommands.tsx` + `useTipTapSlashCommands.ts` | PORT | Commands → registry; menu → thin plugin view |
| `TipTap/components/BubbleMenu.tsx` | PORT | Render from registry + `isActive(ctx)` |
| `TipTap/hooks/useKeyboardHandlers.ts` | PORT | → PM keymap dispatching registry ids |
| `TipTap/hooks/{useEditorSync,useEditorEvents}.ts` | PORT→DELETE | Logic splits into core interceptor + shell; delete after cutover |
| `TipTap/hooks/{useCellManagement,useBeforeUnload,useLinkHandler}.ts` | PORT | Thin shell/port calls (beforeunload stays in shell) |
| `TipTap/config/*` | DELETE (eventual) | TipTap wiring obsolete |
| `utils/{markdownConverters,cellConverters}.ts` | PORT→DELETE | Replaced by `NotebookSerializer` |
| `utils/markdownParser.ts` / `src/utils/markdownParser.ts` | PORT | Title parse + outline → serializer + derived plugin |
| `SlashCommands/*`, `KeyboardShortcuts/useKeyboardShortcuts.ts` | DELETE (Phase 0) | Dead; mine ideas first |
| `KeyboardShortcuts/ShortcutsHelp.tsx` | DELETE (Phase 8) | Only Jupyter editor uses it |
| `TiptapNotebookEditor.tsx` | PORT→DELETE | Becomes `ControlledNotebookEditor`, then deleted |
| `JupyterNotebookEditor.tsx` | DELETE (Phase 8) | Parallel non-PM editor |
| `Cells/*` components | KEEP | Reused as presentational NodeView renderers |
| `Cells/**/model/*ViewModel.ts` | PORT | Inject model/port; drop `useStore.getState()` |
| `Cells/CodeCell/hooks/{useCodeExecution,useOutputProcessing}.ts` | DELETE | Duplicate ViewModel logic |
| `store/notebookStore.ts` | PORT | Becomes intent methods over `NotebookModel`; derived `cells` |
| `store/models/cell.ts` | PORT (drop `CellModel`) | `Cell` = serializer projection; class vestigial |
| `store/codeStore.ts` | PORT | Outputs→node, exec state→plugin, inject `ExecutorService` |
| `services/notebook/CodeExecutionService.ts` | KEEP (inject) | Becomes `ExecutorService` impl |
| `services/stream/actions/*` | PORT | Incremental inserts; `cellId` targeting; drop `ExecAction` alias |
| `services/autoSave/*`, `storage/notebookOrm.ts` | PORT | Serialize PM doc + legacy back-compat reader |
| `Workflow/observation/state/Notebook.ts` | KEEP | Separate server-state mirror; not the editor model |
| `Scenario/View/CreateMode.tsx`, `settings.ts` | PORT | Add `pm` branch, then make default |
| `WorkspacePage.tsx`, `useCellRenderer.tsx`, `useContentResolver.tsx`, `NotebookApp` | KEEP | React routing / non-editor render over shared state |
| `core/`, `adapter/`, `react/` (new) | NEW | `@easynotebook` SDK layers |