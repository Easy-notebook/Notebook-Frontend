# NotebookEditorCore — ProseMirror-First Notebook SDK Design

> **Status:** Proposed
> **Author:** silan.hu@u.nus.edu
> **Date:** 2026-06-04
> **Scope:** Replace the current TipTap+Zustand-coupled notebook editor with a framework-free, store-free, ProseMirror-first SDK (`@easynotebook/notebook-core`) plus a thin React shell.

---

## 1. Motivation & Goals

The current editor inverts the relationship a document editor should have with its model. The **canonical notebook is a flat `cells: Cell[]` array in a Zustand store** (`src/store/notebookStore.ts`, 1637 LOC); the ProseMirror/TipTap document is a *derived projection* round-tripped through HTML via `convertCellsToHtml` / `convertEditorStateToCells` (`src/components/Editor/utils/cellConverters.ts`, 773 LOC). Every custom cell is an **atom block whose content lives entirely inside a React NodeView that reads/writes the global store** (`src/components/Editor/extensions/core/BaseExtension.ts` forces `atom: true` + `ReactNodeViewRenderer` on every node). Markdown is hand-rolled regex (`src/components/Editor/utils/markdownConverters.ts`, 498 LOC), not an AST. Commands are duplicated inline arrays across three surfaces with no registry. Two full editors coexist (`TiptapNotebookEditor.tsx`, `JupyterNotebookEditor.tsx`).

This design produces an **industrial-grade portable SDK** with these properties:

1. **External state, pure core.** The core owns a ProseMirror `EditorState` as the single source of truth. It contains **no Zustand, no React, no `window`, no i18n, no `fetch`**. External state (a Zustand store today, an OOP `NotebookModel` tomorrow) plugs in through a `NotebookAdapter` port.
2. **OOP notebook model.** `NotebookDoc` / `NotebookCell` are encapsulated OOP wrappers over the PM doc (read-side projection + intent methods), analogous in spirit to the existing `src/components/Scenario/Workflow/observation/state/Notebook.ts` but PM-backed and not snake_case.
3. **Precise display / edit / execution.** Code cells embed CodeMirror as NodeView-owned content; outputs are a schema-enforced read-only `outputBlock`; execution runs through an **injected executor service**, not a static singleton.
4. **One injectable, composable command registry.** Slash, toolbar/bubble, and keyboard all consume one `CommandRegistry`. AI/exec/upload/image-gen are injected as `services` on the command context. Commands receive `(state, dispatch, services)` and **never read Zustand**.
5. **Reliable tables & custom Markdown via AST.** A real `mdast` (remark) ⇄ PM bridge replaces the regex/DOM-walk converters.
6. **Packaged as a portable SDK.** Core is publishable standalone; React is only a view adapter (`ControlledNotebookEditor`).

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  React shell  (src/components/Editor/, app code)                       │
│  ControlledNotebookEditor  ◀── replaces TiptapNotebookEditor.tsx       │
│   • mounts core.view into a <div>                                      │
│   • useBeforeUnload, autosave trigger, i18n placeholder                │
│   • SlashMenu / BubbleMenu / DragHandle = React views over plugin state│
└───────────────▲───────────────────────────────────────┬──────────────┘
                │ subscribe (cells in)                   │ change events out
        ┌───────┴────────────────────────────────────────▼──────────────┐
        │  NotebookAdapter  (framework-free port)                        │
        │   replaces useEditorSync.ts + useEditorEvents.ts               │
        │   • applyExternal(cells) → core   • core change → store.setCells│
        └───────▲────────────────────────────────────────┬──────────────┘
                │                                         │
        ┌───────┴─────────────────────────────────────────▼─────────────┐
        │  NotebookEditorCore  (PURE: no React / no Zustand / no window) │
        │   EditorState (PM)  ·  schema  ·  plugins  ·  keymap           │
        │   NotebookDoc / NotebookCell (OOP projection)                  │
        │   CommandRegistry  ·  NotebookSerializer (remark ⇄ PM)         │
        │   NotebookServices (injected: exec/ai/upload/imageGen)         │
        └────────────────────────────────────────────────────────────────┘
```

The **seam** between core and the world is exactly two things, mirroring today's `cellConverters` boundary:
- `NotebookSerializer`: `Cell[] | markdown | pmJSON ⇄ PM doc`.
- `NotebookAdapter`: drives the core from external state and forwards core changes back, using **transaction metadata** (`tr.setMeta(EXTERNAL_META, true)`) instead of the fragile wall-clock `isInternalUpdate` lock currently shared across `useEditorSync` / `useEditorEvents` / `useBeforeUnload`.

---

## 3. Package Layout — `src/notebook-core/`

A self-contained package with **zero imports from `@Store`, `react`, `@tiptap`, `i18next`, or `window`**. (Lint rule + `package.json` `exports` enforce this.)

```
src/notebook-core/
├── package.json                # name: @easynotebook/notebook-core, peerDeps: prosemirror-*
├── index.ts                    # public barrel — the ONLY public surface
│
├── core/
│   ├── NotebookEditorCore.ts        # facade: owns EditorState/EditorView, dispatch interceptor
│   ├── createEditorState.ts         # builds state from schema+plugins+doc
│   ├── transaction.ts               # NotebookTransaction wrapper + meta keys (EXTERNAL_META)
│   └── types.ts                     # CoreOptions, ChangeEvent, Disposer
│
├── schema/
│   ├── schema.ts                    # buildSchema(): PM Schema (nodes+marks)
│   ├── nodes/
│   │   ├── notebook.ts              # doc-level node: content 'titleBlock notebookCell+'
│   │   ├── notebookCell.ts          # generic cell wrapper (cellId, phaseId, metadata)
│   │   ├── titleBlock.ts            # replaces TitleExtension / 'title block+' invariant
│   │   ├── markdownBlock.ts         # native rich-text (NOT atom) — real PM content
│   │   ├── codeCell.ts              # code: NodeView-owned CodeMirror text; attrs lang/enableEdit
│   │   ├── outputBlock.ts           # atom, selectable:false — structured outputs + status
│   │   ├── table.ts                 # GFM table with alignment (re-exports prosemirror-tables)
│   │   ├── imageBlock.ts            # image / generated-image node
│   │   ├── thinkingBlock.ts         # AI thinking node (real persisted attrs)
│   │   └── rawBlock.ts              # raw passthrough
│   ├── marks/marks.ts               # bold/italic/code/strike/link/latexInline
│   └── nodeIds.ts                   # central node-name constants (no hardcoded strings)
│
├── model/
│   ├── NotebookDoc.ts               # OOP read projection + intent dispatch over PM doc
│   ├── NotebookCell.ts              # OOP cell view (typed accessors per cell kind)
│   └── outline.ts                   # derive Task/Phase/Step from heading nodes (PM walk)
│
├── commands/
│   ├── CommandRegistry.ts           # the single registry (slash/toolbar/keyboard consume it)
│   ├── NotebookCommand.ts           # Command type + CommandContext
│   ├── builtins/
│   │   ├── format.ts                # paragraph/heading/list/quote/bold/italic/...
│   │   ├── insert.ts                # code/table/math/image/raw/thinking inserts
│   │   ├── execution.ts             # runCell/runAll/clearOutputs → ctx.services.exec
│   │   ├── navigation.ts            # cross-cell nav (replaces window CustomEvents)
│   │   └── ai.ts                    # ai-generate/append → ctx.services.ai
│   └── groups.ts                    # CommandGroup metadata
│
├── plugins/
│   ├── slashTrigger.ts              # PM plugin: detects '/query', owns menu plugin-state
│   ├── keymap.ts                    # PM keymap dispatching registry commands by id
│   ├── navigation.ts               # gapcursor/arrow cross-cell selection (no CustomEvents)
│   ├── executionState.ts            # ephemeral isExecuting/elapsedTime as plugin state+decos
│   ├── titleDefault.ts              # default-title behavior (was useEditorEvents heuristics)
│   ├── dragHandle.ts                # PM-native block drag (replaces SimpleDragManager)
│   └── stableCellId.ts              # guarantees unique cellId across split/merge/paste
│
├── serialize/
│   ├── NotebookSerializer.ts        # facade: markdown/cells/json ⇄ doc
│   ├── markdown/
│   │   ├── fromMarkdown.ts          # remark-parse+gfm+math+frontmatter → mdast → PM
│   │   └── toMarkdown.ts            # PM → mdast → remark-stringify
│   ├── cells/
│   │   ├── fromCells.ts             # Cell[] → PM doc  (replaces convertCellsToHtml)
│   │   └── toCells.ts               # PM doc → Cell[]  (replaces convertEditorStateToCells)
│   └── json/                        # PM JSON <-> persisted snapshot (+ legacy back-compat)
│
├── services/
│   ├── NotebookServices.ts          # injected service interfaces (exec/ai/upload/imageGen)
│   └── noopServices.ts              # safe defaults for headless/test
│
├── adapter/
│   └── NotebookAdapter.ts           # external-state port contract + base implementation
│
└── nodeviews/                       # framework-AGNOSTIC NodeView contracts (no React here)
    ├── NodeViewFactory.ts           # interface the shell implements with React renderers
    └── CodeMirrorView.ts            # CM6 NodeView (React-free; CM is framework-free)
```

The React renderers (`Cells/CodeCell`, `Cells/AIThinkingCell`, etc.) **stay in `src/components/Editor/`** and are supplied to the core via a `NodeViewFactory`. The core declares *what* node views it needs; the shell decides *how* to render them. This decouples the core from the `./Cells` subsystem that today both editors share.

---

## 4. ProseMirror Schema

Replaces the `BaseExtension` "every node is an `atom` with `cellId` + `fsmState` + React NodeView" pattern. Key change: **markdown cells become native PM rich-text content, not atoms**; only code/output/image/thinking/raw remain NodeView-managed. The vestigial `fsmState`/`ExtensionFSM` scaffolding is **dropped** (no live consumer was found).

| New node | Replaces (current) | Kind | Content / key attrs |
|---|---|---|---|
| `notebook` (doc) | custom `Document` `content:'title block+'` | doc | `titleBlock notebookCell+` |
| `titleBlock` | `TitleExtension` / `TitleNodeView` | textblock | inline; attr `level:1` |
| `notebookCell` | (none — new wrapper) | block | `cellId`, `phaseId`, `metadata`; content = one block child |
| `markdownBlock` | markdown `Cell` + `convertMarkdownToHtml` | **rich content** | native paragraphs/headings/lists/marks |
| `codeCell` | `implementations/CodeBlock/CodeBlockExtension.ts` (`executableCodeBlock`) | NodeView text | content = code text (CM-owned); attrs `language`, `enableEdit`, `displayMode` |
| `outputBlock` | store `outputs[]` + sentinel markers | **atom, `selectable:false`** | attr `items:[{kind,data,mime}]`, `status:'ok'\|'error'\|'empty'`, `executionCount?` |
| `table` / `tableRow` / `tableCell` | TipTap Table + `convertMarkdownTableToHtml` | prosemirror-tables | GFM with **alignment preserved** |
| `imageBlock` | `implementations/Image` | atom | `src`, `alt`, `generationParams?`, `isGenerating?` |
| `thinkingBlock` | `implementations/ThinkingCell` | atom | `agentName`, `textArray`, `customText` (**persisted**, not discarded) |
| `rawBlock` | top-level `RawCellExtension` | atom/code | `raw` text |

### 4.1 Resolving current pain points in the schema

- **Outputs become first-class & read-only.** The in-band sentinel convention (`outputs[0] === '[error-message-for-debug]'` / `'[without-output]'`, currently generated in `notebookStore.updateCellOutputsHelper` and `CellModel.setOutputs`, see `src/store/models/cell.ts:142-153`) is replaced by an explicit `status` field on `outputBlock`. `CodeCellViewModel.showAIdebug` becomes `status === 'error'`.
- **Code text is real PM/CM content**, not `data-code` JSON-in-attrs. `CodeBlockView.tsx` currently ignores `node.attrs.outputs` and looks the cell up in Zustand by `cellId`; we invert this so node attrs are canonical.
- **Stable identity.** `plugins/stableCellId.ts` guarantees `cellId` uniqueness across split/merge/paste/collab — required because async streaming (`generationTracker`, `UpdateCellMetadataAction`) resolves targets by `cellId`/`uniqueIdentifier`.
- **Title invariant** preserved structurally (`titleBlock` as mandatory first child) instead of via the three-place heuristics in `useEditorEvents`.

---

## 5. Public TypeScript API Surface

All exported from `src/notebook-core/index.ts`. Signatures are concrete.

### 5.1 `NotebookEditorCore`

The facade. Owns the PM `EditorState`/`EditorView`, the dispatch interceptor, and the registry. React-free and store-free.

```ts
export interface CoreOptions {
  schema?: Schema;                       // default: buildSchema()
  commands?: CommandRegistry;            // default: built-ins
  serializer?: NotebookSerializer;       // default: markdown+cells
  services?: Partial<NotebookServices>;  // injected exec/ai/upload/imageGen
  nodeViews?: NodeViewFactory;           // shell-supplied renderers (React, CM, …)
  plugins?: Plugin[];                    // extra PM plugins
  initialDoc?: PMNode | NotebookJSON;
}

export type ChangeKind = 'structural' | 'content' | 'selection' | 'meta';

export interface ChangeEvent {
  kind: ChangeKind;                      // classification (replaces onUpdate debounce branch)
  doc: NotebookDoc;                      // OOP projection of new doc
  transaction: NotebookTransaction;
  fromExternal: boolean;                 // true if originated from adapter.applyExternal
}

export type Disposer = () => void;

export class NotebookEditorCore {
  constructor(options?: CoreOptions);

  // --- view lifecycle (the shell calls these; core never imports React) ---
  mount(dom: HTMLElement): void;         // creates EditorView into dom
  unmount(): void;
  focus(): void;
  destroy(): void;

  // --- state access ---
  get state(): EditorState;
  get view(): EditorView | null;
  get doc(): NotebookDoc;                // OOP read projection
  readonly commands: CommandRegistry;
  readonly serializer: NotebookSerializer;

  // --- transactions / commands ---
  dispatch(tr: NotebookTransaction): void;
  runCommand(id: string, args?: unknown): boolean;     // by registry id
  can(id: string): boolean;                            // isAvailable(ctx)

  // --- external sync seam (used by NotebookAdapter) ---
  applyExternal(doc: PMNode | NotebookJSON, opts?: { addToHistory?: boolean }): void;
  on(event: 'change', cb: (e: ChangeEvent) => void): Disposer;

  // --- services injection (post-construction, e.g. when app wires exec) ---
  setServices(services: Partial<NotebookServices>): void;
}
```

**React-free / store-free guarantees.** `mount(dom)` takes a raw `HTMLElement`; no `EditorContent`. `dispatch` runs through a single interceptor that (a) classifies the change and (b) checks `tr.getMeta(EXTERNAL_META)` to set `fromExternal`. There is **no `useStore.getState()`** anywhere — all external reads/writes go through the adapter. This collapses the timing-based `isInternalUpdate` windows (`setTimeout(0)/50ms/30ms/10ms`) in `useEditorSync`/`useEditorEvents` into one meta flag.

### 5.2 `NotebookDoc`

OOP read-side projection over the PM doc — the encapsulated model the goal calls for. Immutable per state; recreated on each `change`. Intent methods produce transactions, they do **not** mutate a side array.

```ts
export class NotebookDoc {
  constructor(state: EditorState);

  get title(): string;
  get cells(): NotebookCell[];           // ordered projection of notebookCell nodes
  get outline(): OutlineNode[];          // derived from headings (replaces parseMarkdownCells)

  cellById(id: string): NotebookCell | null;
  cellAt(index: number): NotebookCell | null;
  indexOf(id: string): number;

  // intent builders — return a NotebookTransaction the caller dispatches
  insertCell(spec: CellSpec, at?: number): NotebookTransaction;
  removeCell(id: string): NotebookTransaction;
  moveCell(id: string, toIndex: number): NotebookTransaction;
  convertCellType(id: string, type: CellKind): NotebookTransaction;

  // interop projection (export/snapshot only — NOT a live mirror)
  toCells(): Cell[];                     // legacy {id,type,content,outputs,...} shape
  toJSON(): NotebookJSON;
  toMarkdown(): string;
}
```

`outline` replaces the per-mutation `parseMarkdownCells(cells)` + `updateCellsPhaseId` regex pass that `notebookStore.ts` runs on nearly every mutation; it becomes a pure read over heading nodes (`model/outline.ts`).

### 5.3 `NotebookCell`

Typed OOP wrapper over one `notebookCell` node. Replaces `CellModel` (`src/store/models/cell.ts`) **and** the `BaseCellViewModel` family's direct store coupling. Per-kind accessors avoid the `[key:string]: any` index-signature sink.

```ts
export type CellKind = 'markdown' | 'code' | 'image' | 'thinking' | 'raw' | 'table';

export class NotebookCell {
  readonly id: string;                   // stable cellId
  readonly kind: CellKind;
  readonly pos: number;                  // PM position of the node
  readonly node: PMNode;

  get phaseId(): string | null;
  get metadata(): Readonly<Record<string, unknown>>;

  // markdown
  get markdown(): string;                // serialized inline content

  // code (codeCell)
  get code(): string;
  get language(): string;
  get enableEdit(): boolean;
  get displayMode(): 'complete' | 'codeOnly' | 'outputOnly';
  get outputs(): readonly OutputBlockItem[];   // from sibling outputBlock
  get executionStatus(): 'ok' | 'error' | 'empty' | undefined;

  // image / thinking
  get image(): { src: string; alt?: string; isGenerating?: boolean } | null;
  get thinking(): { agentName?: string; textArray?: string[] } | null;

  // intent builders (dispatched via core, never touch a store)
  setContent(value: string): NotebookTransaction;
  appendContent(value: string): NotebookTransaction;     // incremental insertText, NOT rewrite
  setOutputs(items: OutputBlockItem[], status: ExecStatus): NotebookTransaction;
  setMetadata(patch: Record<string, unknown>): NotebookTransaction;
}

export interface OutputBlockItem {
  kind: 'text' | 'error' | 'html' | 'image';
  data: string;                          // preserves current renderer contract
  mime?: string;                         // optional richer MIME bundle
}
```

`appendContent` maps to incremental `tr.insertText` at the node boundary (fixing the O(n²) whole-string read-modify-write in `AddContentToCellAction` / `TiptapUpdateAction`).

### 5.4 `NotebookTransaction`

Thin wrapper over PM `Transaction` carrying notebook-level intent and meta. It is what `dispatch` consumes and what intent builders return.

```ts
export const EXTERNAL_META = 'notebook/fromExternal';
export const NO_HISTORY_META = 'addToHistory';   // PM built-in key

export class NotebookTransaction {
  readonly tr: Transaction;
  constructor(tr: Transaction);

  setMeta(key: string, value: unknown): this;
  markExternal(): this;                 // tr.setMeta(EXTERNAL_META, true)
  silent(): this;                       // tr.setMeta('addToHistory', false) — outputs/exec
  get isExternal(): boolean;
  get changeKind(): ChangeKind;         // structural vs content vs selection
}
```

Streamed outputs and 1s-poll partial outputs are dispatched `.silent()` so they never enter undo history or disturb selection — solving the "every poll write becomes a transaction" migration concern.

### 5.5 `NotebookCommand` & `CommandRegistry`

One registry consumed by slash, toolbar/bubble, and keyboard. Commands receive a `CommandContext` exposing PM state/dispatch + injected `services`. **No React, no Zustand, no live TipTap `Editor`, no `editor.isActive`.** Replaces the 3 duplicated inline arrays (`TipTapSlashCommands.tsx`, `BubbleMenu.tsx`, and the dead `SlashCommandMenu.tsx`/`useSlashCommands.ts`/`useKeyboardShortcuts.ts`).

```ts
export interface CommandContext {
  state: EditorState;
  dispatch: (tr: NotebookTransaction) => void;
  view: EditorView;                      // for coordsAtPos etc.
  schema: Schema;
  services: NotebookServices;            // exec/ai/upload/imageGen — injected, store-free
  doc: NotebookDoc;
}

export interface NotebookCommand {
  id: string;                            // unique, e.g. 'insert.codeCell', 'format.h1'
  title: string;
  description?: string;
  icon?: string;
  keywords?: string[];                   // slash search
  group: CommandGroup;                   // 'basic'|'advanced'|'media'|'ai'|'execution'
  shortcut?: string;                     // 'Mod-Enter' → registered into keymap
  isAvailable?(ctx: CommandContext): boolean;
  isActive?(ctx: CommandContext): boolean;   // toolbar highlight (replaces editor.isActive)
  run(ctx: CommandContext, args?: unknown): boolean;
}

export class CommandRegistry {
  register(cmd: NotebookCommand): void;
  registerAll(cmds: NotebookCommand[]): void;
  unregister(id: string): void;
  get(id: string): NotebookCommand | undefined;
  list(filter?: { group?: CommandGroup; query?: string }): NotebookCommand[];
  run(id: string, ctx: CommandContext, args?: unknown): boolean;
  keymap(): Record<string, Command>;     // built from cmd.shortcut → PM keymap plugin
}
```

`services` is how AI/exec/upload/image-gen reach the editor **without** importing stores. Execution command:

```ts
// commands/builtins/execution.ts
export const runCell: NotebookCommand = {
  id: 'execution.runCell',
  title: 'Run cell',
  group: 'execution',
  shortcut: 'Mod-Enter',
  isAvailable: (ctx) => ctx.doc.cellAt(curIndex(ctx))?.kind === 'code',
  run: (ctx) => {
    const cell = currentCodeCell(ctx);
    if (!cell) return false;
    ctx.services.exec.execute(cell.id, cell.code);   // injected, not useCodeStore
    return true;
  },
};
```

### 5.6 `NotebookSerializer`

The canonical, lossless codec. Replaces the four overlapping conversion paths (`convertMarkdownToHtml` MD→HTML regex, `convertHtmlToMarkdown` DOM walk, `extractTextFromNode` PM-JSON→MD, and the DOM fallback) with one `mdast` ⇄ PM layer plus a `Cell[]` interop layer.

```ts
export interface NotebookSerializer {
  // markdown (AST-based: remark-parse/gfm/math/frontmatter)
  fromMarkdown(md: string, schema: Schema): PMNode;
  toMarkdown(doc: PMNode): string;                  // remark-stringify; centralized escaping

  // legacy cell-array interop (import/export & store bridge only)
  fromCells(cells: Cell[], schema: Schema): PMNode; // ← convertCellsToHtml
  toCells(doc: PMNode): Cell[];                      // ← convertEditorStateToCells

  // snapshot persistence with back-compat reader
  fromJSON(json: NotebookJSON | LegacySnapshot, schema: Schema): PMNode;
  toJSON(doc: PMNode): NotebookJSON;
}
```

GFM tables (with `:---:` alignment, currently dropped to `---`), fenced code blocks (currently corrupted when inside a markdown cell), frontmatter (currently write-only in `exportToMarkdown.ts`), and `$...$`/`$$...$$` math (currently heuristic) all become first-class and lossless. Custom nodes with no native markdown (`thinkingBlock`, `rawBlock`, `outputBlock`) serialize via **`remark-directive`** fenced containers (e.g. ` ```{thinking} ... ``` `), so they round-trip instead of being silently dropped.

### 5.7 `NotebookAdapter`

The external-state port. This is where Zustand (today) or an OOP `NotebookModel` (tomorrow) plugs in. It replaces `useEditorSync.ts` (store→editor) + `useEditorEvents.ts` (editor→store) + the `mergeCellsWithStore` re-fetch, and it is **React-free** (the shell wires it via `useEffect`, but the adapter itself is plain TS).

```ts
export interface NotebookStorePort {
  // read external state
  getCells(): Cell[];
  // write external state (called when the core emits a non-external change)
  setCells(cells: Cell[]): void;
  updateCell(id: string, content: string): void;
  setSelection?(cellId: string | null): void;
  // outputs/metadata live richer than the doc — supplied on merge
  mergeOutputs?(cells: Cell[]): Cell[];   // re-attach outputs the doc doesn't carry
}

export class NotebookAdapter {
  constructor(core: NotebookEditorCore, port: NotebookStorePort, serializer: NotebookSerializer);

  /** External state changed → push into core as an EXTERNAL (silent-to-store) transaction. */
  applyExternal(cells?: Cell[]): void;    // default: port.getCells()

  /** Start forwarding core changes → port (returns disposer). */
  connect(): Disposer;

  /** Final flush (blur/destroy/beforeunload) — synchronous. */
  flush(): void;
}
```

**Loop prevention.** `applyExternal` serializes `cells → doc` and dispatches `core.applyExternal(doc)`, which marks the transaction `EXTERNAL_META`. The `connect()` change listener ignores events where `e.fromExternal === true`, so there is no echo — replacing the timing-based reentrancy lock entirely.

**Outputs impedance mismatch.** Because the `Cell[]` shape carries `outputs`/`metadata` richer than the legacy doc projection, `port.mergeOutputs` reproduces today's `mergeCellsWithStore` re-fetch. In the **target** state, outputs live on `outputBlock` nodes, so `mergeOutputs` becomes a no-op and can be dropped.

### 5.8 `NotebookServices` (injected dependencies)

The injection point that keeps the core free of `fetch`, `useCodeStore`, and `AIAgentStore`. The app supplies concrete implementations that wrap `CodeExecutionService`, the stream-action pipeline, upload, and image-gen.

```ts
export interface ExecutionService {
  execute(cellId: string, code: string): Promise<void>;  // wraps CodeExecutionService
  cancel(cellId: string): void;
  onOutputs(cb: (cellId: string, items: OutputBlockItem[], status: ExecStatus) => void): Disposer;
  onExecState(cb: (cellId: string, s: { running: boolean; elapsed: number }) => void): Disposer;
}
export interface AIService { append(cellId: string, text: string): void; generate(prompt: string, at: number): Promise<string>; }
export interface UploadService { upload(file: File): Promise<{ src: string }>; }
export interface ImageGenService { generate(params: ImageGenParams): Promise<{ src: string }>; }

export interface NotebookServices {
  exec: ExecutionService;
  ai: AIService;
  upload: UploadService;
  imageGen: ImageGenService;
}
```

`exec.onOutputs`/`onExecState` callbacks dispatch **`.silent()`** transactions into the core (no history, no selection disturbance). The single-global-kernel assumption in `codeStore.ts` becomes the executor's internal concern, and the two execution paths (`codeStore.executeCell` interactive vs `useScriptStore.execCodeCell` workflow) unify behind `ExecutionService.execute`.

---

## 6. React Shell — `ControlledNotebookEditor`

Lives in `src/components/Editor/ControlledNotebookEditor.tsx` and is essentially today's `TiptapNotebookEditor.tsx` (349 LOC) minus all model logic. It is a **thin view adapter**.

```ts
export interface ControlledNotebookEditorProps {
  cells: Cell[];                         // from notebookStore selector
  storePort: NotebookStorePort;          // wraps setCells/updateCell/setEditingCellId
  services: Partial<NotebookServices>;   // wraps codeStore/AIAgentStore/upload
  placeholder?: string;                  // i18n stays in the shell
  readOnly?: boolean;
}
```

Responsibilities (and what they replace):

| Shell concern | Replaces |
|---|---|
| `mount(core.view)` into a `<div>` | `useEditor` + `EditorContent` |
| `useEffect(() => adapter.applyExternal(cells), [cells])` | `useEditorSync.ts` |
| `adapter.connect()` forwarding core→port | `useEditorEvents.ts` `onUpdate`→`setCells`/`updateCell` |
| `useBeforeUnload` → `adapter.flush()` + `AutoSaveService` | `useBeforeUnload.ts` (unchanged, app concern) |
| i18n placeholder, default-title localization | i18n baked into `useEditorEvents` (now a core `titleDefault` plugin + shell string) |
| SlashMenu / BubbleMenu / DragHandle React views over plugin state | `TipTapSlashCommands.tsx`, `BubbleMenu.tsx`, `SimpleDragManager.tsx` |
| `NodeViewFactory` supplying `Cells/CodeCell`, `AIThinkingCell`, `ImageCell` | the React NodeViews in `implementations/*/...View.tsx` |
| imperative ref API (`getCells/addCodeCell/...`) | `useImperativeHandle` + `useCellManagement.ts` → `core.commands` |

The slash/bubble menus become **pure views**: they call `core.commands.list({ group, query })` and `core.runCommand(id)`; selection/position come from the `slashTrigger` plugin's PM plugin-state, not React `useState` + document-level capture-phase keydown listeners.

The non-editor render paths (`useCellRenderer.tsx`, `useContentResolver.tsx`, `WorkspacePage.tsx`, demo/complete modes) are **unaffected** — they remain React views over the same store and coexist with `ControlledNotebookEditor`.

---

## 7. Mapping: Current File → New Module

| Current file (LOC) | New home | Disposition |
|---|---|---|
| `store/notebookStore.ts` (1637) | external — kept, but as `NotebookStorePort` impl | becomes a *consumer* of the doc, not source of truth |
| `store/models/cell.ts` `CellModel` (156) | `model/NotebookCell.ts` | replaced; sentinel logic → `outputBlock.status` |
| `Cells/model/BaseCellViewModel.ts` (148) | split: ephemeral UI stays React; store reads → `services`/`port` | de-coupled |
| `Cells/CodeCell/model/CodeCellViewModel.ts` (461) | exec → `services.exec`; reads → `NotebookCell` | de-coupled from `useCodeStore` |
| `TiptapNotebookEditor.tsx` (349) | `ControlledNotebookEditor.tsx` | thinned to view adapter |
| `JupyterNotebookEditor.tsx` (729) | **deleted** after `editorType` switch removed | dead path |
| `TipTap/hooks/useEditorSync.ts` | `adapter/NotebookAdapter.ts` (`applyExternal`) | inverted direction |
| `TipTap/hooks/useEditorEvents.ts` (406) | `adapter` (`connect`) + core plugins (`titleDefault`) | split |
| `utils/cellConverters.ts` (773) | `serialize/cells/{fromCells,toCells}.ts` | becomes the codec seam |
| `utils/markdownConverters.ts` (498) | `serialize/markdown/*` (remark) | replaced by AST |
| `utils/markdownParser.ts` + `utils/markdownParser.ts` (outline) | `model/outline.ts` (PM walk) | replaced |
| `extensions/core/BaseExtension.ts` | `schema/nodes/*` specs | `fsmState` dropped |
| `implementations/CodeBlock/CodeBlockExtension.ts` (366) | `schema/nodes/codeCell.ts` + `nodeviews/CodeMirrorView.ts` | code text → real content |
| `implementations/CodeBlock/CodeBlockView.tsx` (109) | `Cells/CodeCell` via `NodeViewFactory` | reads node attrs, not store |
| `implementations/ThinkingCell/*` | `schema/nodes/thinkingBlock.ts` | attrs persisted |
| `implementations/Image/*`, `UploadDropExtension.ts` | `schema/nodes/imageBlock.ts` + `services.upload/imageGen` | |
| `extensions/RawCellExtension`, `TitleExtension` | `schema/nodes/{rawBlock,titleBlock}.ts` | |
| `TipTapSlashCommands.tsx` (480) + `useTipTapSlashCommands.ts` (203) | `plugins/slashTrigger.ts` + `commands/*` + React SlashMenu view | one registry |
| `components/BubbleMenu.tsx` (119) | React BubbleMenu view over `commands.list()` | de-duplicated |
| `hooks/useKeyboardHandlers.ts` (111) | `plugins/keymap.ts` + `plugins/navigation.ts` | node names centralized |
| `BlockManager/SimpleDragManager.tsx` (415) | `plugins/dragHandle.ts` (PM-native) | re-evaluated |
| `services/notebook/CodeExecutionService.ts`, `store/codeStore.ts` | wrapped by `services.exec` impl | injected |
| `services/stream/actions/*` | resolve target by `cellId` → `core` `.silent()` tx | append, not rewrite |
| Workflow `observation/state/Notebook.ts` (114) | **precedent only** | separate server mirror; not reused |

---

## 8. Pre-Migration Cleanup (mechanical, low-risk)

Delete before schema work to isolate the live path (~3000+ LOC, removes porting-a-dead-variant risk):

- **BlockManager:** keep only `SimpleDragManager.tsx`. Delete `SimpleTipTapBlockManager.tsx` + `BlockToolbar.tsx`, `StableBlockManager.tsx`, `DraggableBlockManager.tsx`, `MinimalBlockManager.tsx`, `SimpleDragBlockManager.tsx`, `useBlockManager.ts`, `DragIndicator.tsx`, `BlockManagerExtensionImproved.ts`, and the 0-byte `BlockManagerExtension.ts`.
- **Duplicate extensions:** delete top-level `extensions/CodeBlockExtension.tsx` (453, dead) and `extensions/LaTeXExtension.tsx` (715, dead); live ones are under `implementations/*`.
- **Dead command systems:** delete `SlashCommands/useSlashCommands.ts` (304), `SlashCommands/SlashCommandMenu.tsx` (326), `extensions/SlashCommandExtension.tsx` (47), `KeyboardShortcuts/useKeyboardShortcuts.ts` (317). Mine their unique ideas (`ai-generate`, command-palette/save/undo/run shortcuts) into the new registry first.
- **Dead JS:** delete `extensions/katex-extension.js` (155), `extensions/mermaid-extension.js` (91).
- **Vestigial FSM:** delete `extensions/core/ExtensionFSM.ts` and drop the `fsmState` attr.
- **Debug noise:** strip `console.log` from `notebookStore`, `TiptapNotebookEditor`, `useEditorSync` (`DEBUG=true` committed), `cellConverters` (`DEBUG=true` committed), `JupyterNotebookEditor`.

---

## 9. Migration Phases

1. **Cleanup** (§8) — delete dead variants; collapse to one live path.
2. **Stand up the core skeleton** — `src/notebook-core/` with schema, `buildSchema()`, `NotebookEditorCore.mount/dispatch`, headless tests (no React).
3. **Serializer** — implement `serialize/cells/{fromCells,toCells}` to byte-match current `cellConverters` behavior (the contract), then add `serialize/markdown/*` (remark) alongside, with golden round-trip tests for tables/code-fence/math/frontmatter.
4. **Adapter & shell** — build `NotebookAdapter` + `ControlledNotebookEditor`; mount in `CreateMode.tsx` behind a feature flag; `notebookStore` still source of truth via the port (parallel run).
5. **Invert source of truth** — flip so the PM doc is canonical; `outputs`/`displayMode` move onto `outputBlock`/`codeCell` attrs; `services.exec.onOutputs` dispatches `.silent()` transactions; retire `useEditorSync`/`useEditorEvents`/`mergeCellsWithStore` and the `cellModes`/`metadata.displayMode` duplication.
6. **Commands & navigation** — fold slash/bubble/keyboard into the registry; replace `markdown-cell-focus`/`cell-navigation` CustomEvents with `plugins/navigation.ts`.
7. **Persistence back-compat** — `serializer.fromJSON` reads the legacy `{cells, tasks}` `NotebookSnapshot`; new writes emit PM JSON.
8. **Delete legacy** — remove `JupyterNotebookEditor.tsx`, the `editorType` switch (`settingsStore.ts`, `settings.ts`), and dead converters once parity is verified.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sync echo loops (today's `isInternalUpdate` windows) | `EXTERNAL_META` transaction meta + `fromExternal` filter in adapter |
| Lossy `Cell[]` ⇄ doc (outputs not in doc) | Phase-4 keeps `mergeOutputs`; Phase-5 moves outputs onto `outputBlock` → no-op |
| Output polling spamming undo history | `.silent()` (`addToHistory:false`) transactions via plugin/services |
| Stable `cellId` across split/merge/paste | `plugins/stableCellId.ts` enforces uniqueness; streaming resolves by `cellId` |
| Markdown round-trip regressions | golden-file tests; serializer parity gate before invert |
| 112 importers of `notebookStore` blast radius | port keeps the same `Cell[]` surface during phases 4–5; redirect writers incrementally |
| Custom blocks lost on markdown export | `remark-directive` fenced containers for thinking/raw/output |
| Two exec paths diverging | both unified behind `ExecutionService.execute` |

---

## 11. Definition of Done

- `src/notebook-core/` builds and tests **headless** (no React/jsdom required for core logic).
- A lint boundary forbids `react`, `zustand`/`@Store`, `i18next`, `window`, `fetch` imports inside `src/notebook-core/`.
- The PM doc is the single source of truth; `notebookStore` consumes it via `NotebookStorePort`.
- Slash, bubble, and keyboard all dispatch through one `CommandRegistry`; no duplicated command arrays remain.
- Markdown export→import is lossless for headings, GFM tables (with alignment), fenced code, math, frontmatter, and custom blocks.
- `JupyterNotebookEditor.tsx`, the `editorType` switch, and the regex/DOM converters are deleted.
- The core is `npm pack`-able as `@easynotebook/notebook-core` with `prosemirror-*` as peer dependencies and React as an optional view adapter only.