# Migration progress tracker

TipTap → ProseMirror-first notebook kernel. Plan: see `04-migration-plan.md`.

| Phase | Status | Notes |
|---|---|---|
| 0 — Dead-code cleanup | ✅ done | 18 files deleted (10 dead BlockManager variants + BlockToolbar, top-level CodeBlock/LaTeX dups, katex/mermaid js, SlashCommandExtension, dead SlashCommands/ + useKeyboardShortcuts). Barrel + debug-log strip. tsc 226→187, **0 new error files**. Shortcuts mined → `mined-keyboard-shortcuts.md`. |
| 1 — Core scaffold | ✅ done | `src/components/Editor/core/` created, **off the live path**. 22 tests pass. tsc still 187, core clean. |
| 2 — Schema + serializer (round-trip tests) | ✅ core done | Full schema (`schema.ts`) + remark/mdast `NotebookSerializer`: markdown round-trip, `:::thinking/:::raw/:::image` directives, **legacy `Cell[]`↔doc interop + `legacySnapshotToDoc` back-compat reader**. Validated vs the **real `templateNotebook.json` (25 cells)** — ids/types/flags preserved, code verbatim, markdown idempotent, output sentinels → structured status. **70 tests, core tsc-clean.** Remaining hardening: more real fixtures; tables/directives nested inside a markdown cell. |

> ⚠️ **Parallel SDK discovered.** An untracked `src/notebook/` tree (`EasyNotebookContainer`, `mountEasyNotebook`, `ControlledNotebookEditor`, headless `EasyNotebookDocumentModel`, `NotebookRuntimeProvider`) implements the same `@easynotebook` portable-SDK goal **without ProseMirror** — it renders cells via `<textarea>` + `ReactMarkdown` (not WYSIWYG). Its `EasyNotebookCell` shape ≈ this core's `CellLike`, so `NotebookSerializer.cellsToDoc/docToCells` already bridges them. **Recommended convergence:** this PM core becomes the WYSIWYG editing engine mounted inside `src/notebook/`'s `ControlledNotebookEditor` (replacing textarea+ReactMarkdown), with `EasyNotebookDocumentModel` as the external OOP state model. Pending user decision before Phases 4+.
| 3 — Command registry | ⬜ | Builtins; port slash/bubble/keymap defs. |
| 4 — `ControlledNotebookEditor` (behind `editorType:'pm'`) | ⬜ | First in-app run; `NotebookAdapter`. |
| 5 — Per-cell PM NodeViews | ⬜ | Attr-driven; codeCell last. |
| 6 — Execution / AI streaming via services | ⬜ | `.silent()` output writes; incremental insertText. |
| 7 — Invert source-of-truth; `pm` default | ⬜ | Highest blast radius (112 store importers + persistence). |
| 8 — Retire legacy editors; package SDK | ⬜ | Delete tiptap+jupyter editors; `@easynotebook/*`. |

## Phase 1 — what landed (`src/components/Editor/core/`)

- `schema.minimal.ts` — `notebook > (markdownBlock | rawBlock)+` (placeholder; full schema in Phase 2)
- `NotebookEditorCore.ts` — facade: owns `EditorState`/optional `EditorView`, single `dispatch` interceptor (classifies change + flags `fromExternal`), `applyExternal`, `on('change')`, command runner. **No React/Zustand/window/fetch.**
- `NotebookDoc.ts` / `NotebookCell.ts` — OOP read projection over the doc
- `NotebookTransaction.ts` — meta wrapper (`markExternal()`, `silent()`, `changeKind`)
- `NotebookCommand.ts` — `CommandContext` + `CommandRegistry`
- `ports.ts` — `NotebookStorePort` + service injection interfaces
- `index.ts` — public SDK entry
- `__tests__/` — change classification, **timer-free echo-guard / no-loop proof**, import-restriction guard

## Phase 2 — what landed

- `schema.ts` — the full production schema: `notebook > titleBlock + notebookCell+`, with cell bodies `markdownBlock` (rich `block+`: paragraph/heading/list/task-list/blockquote/codeBlock/mathDisplay/hr), `codeCell` (`codeText` + optional read-only `outputBlock`), `imageBlock`, `thinkingBlock` (durable streamed attrs), `rawBlock`, and the official `prosemirror-tables` family. Marks: strong/em/code/strike/link. `NODE` constant map = single source for type-name literals.
- `NotebookSerializer.ts` — the **only** module that knows Markdown. Real AST round-trip `markdown ⇄ mdast (remark+gfm+math+frontmatter) ⇄ PM doc`. Each top-level mdast node → one cell; first H1 → titleBlock.
- Tests (49 in `core/`, 64 total): schema validation incl. table family + JSON round-trip + negative cases; serializer **idempotence** across a 13-entry corpus; fidelity checks for GFM table alignment, inline-vs-block math, and all five marks.

### Phase 2 deps added (npm)
`remark-parse`, `remark-gfm`, `remark-math`, `remark-frontmatter`, `remark-stringify`, `mdast-util-to-markdown`, `unified` — installed into `node_modules`. ⚠️ These need to be reflected in a committed `package.json`, which currently also carries **unrelated pre-existing uncommitted changes** — reconcile before committing so the migration commit doesn't bundle them.

### Phase 2 still-TODO (do not mark phase complete until):
1. `remark-directive` serialization for `thinkingBlock` / `rawBlock` / `imageBlock` (and `outputBlock` re-hydration) so custom cells round-trip losslessly through `.md`.
2. `docFromCells` / `cellsFromDoc` legacy interop + `legacySnapshotToDoc` IndexedDB back-compat reader.
3. **Golden corpus from REAL notebooks** — replace the authored starter corpus; treat any non-idempotent real fixture as a blocking bug.

## Known follow-ups (carry into later phases)

- **Explicit PM deps**: `prosemirror-state/model/view` currently resolve transitively via TipTap. Add them as direct `package.json` deps before SDK extraction (Phase 8) — but note the working tree already has unrelated uncommitted `package.json` changes (see below).
- **Working tree caution**: this session opened with substantial pre-existing uncommitted changes outside the migration (App.tsx, package.json, tsconfig.json, vite.config.js, NotebookApp.tsx, …). When committing migration phases, stage **only** migration files — never `git add -A`.
- Baseline tsc has **187 pre-existing errors** unrelated to the migration; gate each phase on "no *new* error files" rather than zero.
