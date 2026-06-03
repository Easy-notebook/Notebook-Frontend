# Migration progress tracker

TipTap → ProseMirror-first notebook kernel. Plan: see `04-migration-plan.md`.

| Phase | Status | Notes |
|---|---|---|
| 0 — Dead-code cleanup | ✅ done | 18 files deleted (10 dead BlockManager variants + BlockToolbar, top-level CodeBlock/LaTeX dups, katex/mermaid js, SlashCommandExtension, dead SlashCommands/ + useKeyboardShortcuts). Barrel + debug-log strip. tsc 226→187, **0 new error files**. Shortcuts mined → `mined-keyboard-shortcuts.md`. |
| 1 — Core scaffold | ✅ done | `src/components/Editor/core/` created, **off the live path**. 22 tests pass. tsc still 187, core clean. |
| 2 — Schema + serializer (round-trip tests) | ✅ done | Full schema (`schema.ts`) + remark/mdast `NotebookSerializer`: markdown round-trip, lossless `:::thinking/:::raw/:::image` + **unknown-directive** containers, inline images, top-level raw HTML, **legacy `Cell[]`↔doc interop (object `OutputItem` + error/empty status preserved) + `toJSON/fromJSON` persistence + `legacySnapshotToDoc` back-compat reader**. Hardened by a 6-way adversarial pass (13 findings; all 10 blocker/major fixed, regression-tested). **101 core tests, 0 new core tsc errors** (repo total unchanged at 187). Known minor limits below. |

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
- `NotebookSerializer.ts` completion (2nd pass): `remark-directive` wired both directions; `:::thinking/:::raw/:::image` + **unknown** directives round-trip losslessly (unknown name+attrs preserved via `rawBlock.directiveName/directiveAttrs`); HTML raw bodies captured **verbatim** via mdast source-position slicing; plain `![](src)` → inline `inlineImage` (block `imageBlock` reserved for `:::image`); top-level raw HTML preserved.
- Legacy interop: `cellsToDoc`/`docToCells` (aka `fromCells`/`toCells`) preserve id↔cellId, type, code attrs, `phaseId`, `metadata`, hybrid→(markdownBlock+codeCell) decomposition, link→linked paragraph; **object `OutputItem`s round-trip verbatim** (via `item.raw` + `fromString` discriminator) and error/empty `status` is detected from both the string sentinel and object `type:'error'`. `toJSON`/`fromJSON` persistence (`{schemaVersion, doc}`, `Node.fromJSON`-validated) + `legacySnapshotToDoc` back-compat reader.
- Tests: **101 in `core/`** — schema validation + JSON round-trip; serializer idempotence corpus; a 32-case adversarial suite (escaping/injection, table pipes & 4 alignments, nested/ordered/task lists, math/frontmatter edges, directive blocks) + a 14-case confirmed-failures regression suite. Validated vs the real `templateNotebook.json` (25 cells).

### Phase 2 deps (npm)
`remark-parse/gfm/math/frontmatter/stringify/directive`, `mdast-util-to-markdown`, `unified` — already present in `package.json` (which also carries unrelated pre-existing uncommitted changes; migration commits stage only `core/` + `docs/migration/`, never `package.json`).

### Phase 2 known minor limits (within spec; revisit if needed)
1. **Ragged GFM table** (data row narrower than header) breaks `doc.eq` round-trip — malformed input; `prosemirror-tables` `fixTables` repairs it at editor runtime.
2. **Loose lists** flatten to tight (mdast `spread` not modeled) — one-time normalization, idempotent thereafter.
3. **Empty `---\n---` frontmatter** is dropped (no payload) — non-empty frontmatter round-trips fine.

## Known follow-ups (carry into later phases)

- **Explicit PM deps**: `prosemirror-state/model/view` currently resolve transitively via TipTap. Add them as direct `package.json` deps before SDK extraction (Phase 8) — but note the working tree already has unrelated uncommitted `package.json` changes (see below).
- **Working tree caution**: this session opened with substantial pre-existing uncommitted changes outside the migration (App.tsx, package.json, tsconfig.json, vite.config.js, NotebookApp.tsx, …). When committing migration phases, stage **only** migration files — never `git add -A`.
- Baseline tsc has **187 pre-existing errors** unrelated to the migration; gate each phase on "no *new* error files" rather than zero.
