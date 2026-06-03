# Migration progress tracker

TipTap → ProseMirror-first notebook kernel. Plan: see `04-migration-plan.md`.

| Phase | Status | Notes |
|---|---|---|
| 0 — Dead-code cleanup | ✅ done | 18 files deleted (10 dead BlockManager variants + BlockToolbar, top-level CodeBlock/LaTeX dups, katex/mermaid js, SlashCommandExtension, dead SlashCommands/ + useKeyboardShortcuts). Barrel + debug-log strip. tsc 226→187, **0 new error files**. Shortcuts mined → `mined-keyboard-shortcuts.md`. |
| 1 — Core scaffold | ✅ done | `src/components/Editor/core/` created, **off the live path**. 22 tests pass. tsc still 187, core clean. |
| 2 — Schema + serializer (round-trip tests) | ⬜ next | The keystone. Full 9-node schema + remark/mdast `NotebookSerializer` + golden round-trip corpus. |
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

## Known follow-ups (carry into later phases)

- **Explicit PM deps**: `prosemirror-state/model/view` currently resolve transitively via TipTap. Add them as direct `package.json` deps before SDK extraction (Phase 8) — but note the working tree already has unrelated uncommitted `package.json` changes (see below).
- **Working tree caution**: this session opened with substantial pre-existing uncommitted changes outside the migration (App.tsx, package.json, tsconfig.json, vite.config.js, NotebookApp.tsx, …). When committing migration phases, stage **only** migration files — never `git add -A`.
- Baseline tsc has **187 pre-existing errors** unrelated to the migration; gate each phase on "no *new* error files" rather than zero.
