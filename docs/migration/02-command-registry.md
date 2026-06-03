# Injectable, Store-Free Command Registry — Design Document

> Status: Design / RFC
> Scope: `@easynotebook` notebook SDK — command subsystem
> Audience: editor-core maintainers, NodeView authors, AI/exec/upload integrators
> Supersedes: `TipTapSlashCommands.tsx` inline command array, `BubbleMenu.tsx` inline buttons, `useKeyboardHandlers.ts` structural handler, and the dead `useSlashCommands.ts` / `SlashCommandMenu.tsx` / `useKeyboardShortcuts.ts` / `SlashCommandExtension.tsx` trees.

---

## 1. Problem statement

Today there is **no command abstraction**. Each input surface re-declares its own command list and calls TipTap chains inline:

- **Slash menu** — a hardcoded `commands: TipTapCommand[]` array *inside the render body* of `TipTapSlashCommands.tsx` (13 entries), each `action: (editor, query) => void` calling `editor.chain()...` plus `try/catch` raw-HTML fallbacks.
- **Bubble/toolbar menu** — hardcoded buttons in `BubbleMenu.tsx` calling `editor.chain().focus().toggleBold()...` inline; heading/list/quote logic duplicated against the slash list.
- **Keyboard** — `useKeyboardHandlers.ts`, PM-native but *structural only* (Tab, Cmd+Home/End, Backspace node-downgrade). It dispatches **no business commands**. The advertised save/undo/redo/run shortcuts (`useKeyboardShortcuts.ts`) are **dead** — never wired.

Three divergent sources of truth exist (`'orderedlist'` vs `'numberedlist'`, `'blockquote'` vs `'quote'`, `'thinking'` vs `'ai-thinking'`). Business actions (execution, AI streaming, upload, image-gen) **never flow through commands at all** — they live inside store-coupled NodeViews calling `useStore.getState()` / `useCodeStore.getState()` directly.

### Goals

1. **One registry.** Slash menu, toolbar/bubble menu, and keyboard all consume the *same* `CommandRegistry`. No duplicated command arrays.
2. **Store-free.** A command definition imports **no Zustand**, no React, no live TipTap `Editor`. It receives a `CommandContext` carrying PM `state`/`dispatch`/`view` plus an injected `services` port.
3. **Injectable capabilities.** AI, execution, upload, and image-generation are *not* in the core. They are provided by the host and registered as commands + service implementations at editor-construction time.
4. **Composable.** Commands chain/sequence/branch through a small combinator algebra, mirroring (but not depending on) PM's `chainCommands`.
5. **Portable.** The registry and the `NotebookCommand` contract are part of the framework-free `NotebookEditorCore`; React (`ControlledNotebookEditor`) is only a *view* that renders menus from the registry and forwards key events into the keymap.

---

## 2. Architectural placement

```
┌──────────────────────────────────────────────────────────────────────┐
│ ControlledNotebookEditor (React shell — view adapter)                  │
│   • renders SlashMenu / BubbleMenu / Toolbar FROM the registry         │
│   • forwards DOM key events → core keymap                              │
│   • holds NO command definitions                                       │
└───────────────▲───────────────────────────────────┬──────────────────┘
                │ registry.list(ctx) / run(id, ctx)  │ services injected
                │                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ NotebookEditorCore (framework-free: no React, no Zustand, no window)   │
│  ┌────────────────────┐   ┌──────────────────────────────────────┐    │
│  │ CommandRegistry     │   │ CommandContext factory                │   │
│  │  register/list/run  │──▶│  { state, dispatch, view, doc,        │   │
│  └────────────────────┘    │    selection, schema, services,       │   │
│            ▲                │    intents, t }                       │   │
│  builtin commands          └──────────────────────────────────────┘    │
│  (paragraph, headings,            ▲ services port (injected)            │
│   lists, table, code,             │                                     │
│   image, math, raw, thinking)     │                                     │
└───────────────────────────────────┼─────────────────────────────────┘
                                     │
        ┌────────────────────────────┴───────────────────────────┐
        │ Injected capability modules (host-provided)              │
        │  AICapability · ExecCapability · UploadCapability ·      │
        │  ImageGenCapability  → each contributes commands +       │
        │  a service implementation (NotebookServices slice)       │
        └─────────────────────────────────────────────────────────┘
```

The registry lives **in the core**. The React shell never owns command logic; it only *projects* the registry into UI and pipes user input back.

---

## 3. The `CommandContext`

Commands never read Zustand. They receive an explicit context derived from the PM `EditorView` plus the injected `services`. The context is **constructed fresh per invocation** so `state`/`selection` are always current.

```ts
import type { EditorState, Transaction, Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode, Schema, ResolvedPos } from 'prosemirror-model';

/** A dispatch that the registry can intercept (history flags, fromExternal meta, etc.). */
export type CommandDispatch = (tr: Transaction) => void;

/**
 * Everything a command is allowed to touch. No Zustand, no React, no window.
 * `view` is optional: pure transaction commands can run headless (tests, batch
 * import, server-side), and only DOM-touching commands (coordsAtPos, focus)
 * require it.
 */
export interface CommandContext {
  /** Current PM state. Always fresh at call time. */
  readonly state: EditorState;
  /** Apply a transaction. May be a real view.dispatch or a capturing stub. */
  readonly dispatch: CommandDispatch;
  /** Present only when a live view exists (interactive). Absent in headless runs. */
  readonly view?: EditorView;

  /** Convenience accessors (derived from state; read-only). */
  readonly doc: PMNode;
  readonly selection: Selection;
  readonly schema: Schema;

  /** Injected external capabilities. The ONLY route to AI/exec/upload/image-gen. */
  readonly services: NotebookServices;

  /**
   * Side-effect intents the core cannot perform itself (focus a CodeMirror cell,
   * open a file picker, scroll into view). The shell drains these; commands stay pure.
   */
  readonly intents: IntentSink;

  /** Optional argument string (slash query tail, e.g. `/h2 foo` → "foo"). */
  readonly arg?: string;

  /** i18n lookup, injected — no react-i18next inside core. */
  readonly t: (key: string, fallback?: string) => string;
}

/** Helpers a command may use without re-deriving from raw PM. */
export interface CommandContextHelpers {
  readonly $from: ResolvedPos;
  readonly $to: ResolvedPos;
  isNodeActive(nodeType: string, attrs?: Record<string, unknown>): boolean;
  isMarkActive(markType: string): boolean;
  /** Stable cellId of the cell containing the selection head, if any. */
  currentCellId(): string | null;
}

export type FullCommandContext = CommandContext & CommandContextHelpers;
```

### 3.1 Intents — keeping commands pure

Some legacy behaviors cross the editor/DOM boundary (focus a CodeMirror instance after inserting a code cell; the `markdown-cell-focus` / `cell-navigation` `CustomEvent`s). Commands must **not** call `document.querySelector` or dispatch window events. Instead they push an *intent*; the shell drains intents after each command and performs the DOM effect.

```ts
export type EditorIntent =
  | { kind: 'focusCell'; cellId: string; place?: 'start' | 'end' }
  | { kind: 'scrollIntoView'; pos: number }
  | { kind: 'openFilePicker'; accept: string; multiple: boolean; token: string }
  | { kind: 'openPrompt'; field: string; token: string } // replaces window.prompt()
  | { kind: 'navigateCell'; direction: 'up' | 'down'; fromCellId: string };

export interface IntentSink {
  emit(intent: EditorIntent): void;
}
```

This replaces the bespoke `window.dispatchEvent(new CustomEvent('cell-navigation'))` and `document.querySelector('[data-cell-id] .cm-editor')` focus logic with a typed channel the shell owns.

---

## 4. `NotebookServices` — the injectable capability port

The single object through which commands reach external capabilities. The **core ships only the interface and no-op defaults**; the host injects real implementations. This is what makes AI/exec/upload/image-gen "injected externally, commands never read Zustand directly."

```ts
/** Result envelope so commands can branch on success/failure without throwing. */
export interface ServiceResult<T = void> {
  ok: boolean;
  value?: T;
  error?: string;
}

export interface ExecutionService {
  /** Run code for a cell. Output writeback is the service's job (via OutputPort), not the command's. */
  execute(cellId: string, code: string, opts?: ExecOptions): Promise<ServiceResult<ExecOutcome>>;
  cancel(cellId: string): Promise<ServiceResult>;
  status(cellId: string): ExecRuntimeState; // ephemeral: isExecuting/elapsed — read-only snapshot
}

export interface AIService {
  /** Stream content into a target cell. Returns a handle so the command can stay fire-and-forget. */
  generate(req: AIGenerateRequest): Promise<ServiceResult<AIStreamHandle>>;
  /** AI prose answers (sidebar QA) — kept OUT of the document, exposed for completeness. */
  ask?(question: string): Promise<ServiceResult>;
}

export interface UploadService {
  upload(files: File[], opts?: UploadOptions): Promise<ServiceResult<UploadedAsset[]>>;
}

export interface ImageGenService {
  generate(prompt: string, params?: ImageGenParams): Promise<ServiceResult<GeneratedImage>>;
}

/** How a service writes results back into the document — itself a thin PM-transaction port. */
export interface OutputPort {
  /** Apply outputs to a cell node by stable cellId, with addToHistory:false. */
  setOutputs(cellId: string, outputs: OutputItem[], status: ExecStatus): void;
  /** Mark/clear ephemeral runtime flags surfaced via decorations. */
  setRuntime(cellId: string, runtime: Partial<ExecRuntimeState>): void;
  appendText(cellId: string, text: string): void; // incremental AI append (insertText, not full rewrite)
}

/** The whole port. Optional members may be absent → related commands self-disable. */
export interface NotebookServices {
  readonly execution?: ExecutionService;
  readonly ai?: AIService;
  readonly upload?: UploadService;
  readonly imageGen?: ImageGenService;
  /** Always present (provided by core): how services mutate the doc. */
  readonly output: OutputPort;
}
```

**Key inversion vs. today:** execution/AI/upload no longer live in NodeViews calling `useCodeStore.getState().executeCell()`. A command invokes `ctx.services.execution.execute(...)`, and the service writes back through `OutputPort` (PM transactions with `addToHistory:false`), never through Zustand. NodeViews receive the same `services` (via the core's NodeView context) instead of importing stores.

Absent capabilities degrade gracefully: a command whose required service is missing reports `isAvailable(ctx) === false` and is hidden from menus.

---

## 5. The `NotebookCommand` interface

```ts
export type CommandGroup =
  | 'basic'      // paragraph, headings, lists, quote
  | 'block'      // code, table, raw, divider
  | 'media'      // image, video, file
  | 'format'     // bold/italic/strike/inline-code (toolbar)
  | 'ai'         // ai-generate, thinking
  | 'exec'       // run, run-all, clear-outputs, cancel
  | 'nav';       // structural / cursor

export interface CommandMeta {
  /** Stable, unique, kebab-case id. Single source of truth across all surfaces. */
  readonly id: string;
  readonly title: string;            // i18n key OR literal; resolved via ctx.t in the view
  readonly description?: string;
  readonly icon?: string;            // icon token, resolved by the view
  readonly group: CommandGroup;
  /** For slash fuzzy-match + keyword search. */
  readonly keywords?: readonly string[];
  /** Default keybinding(s), e.g. "Mod-b", "Mod-Enter". Registered into the keymap. */
  readonly keybinding?: string | readonly string[];
  /** Where this command may surface. Defaults to all. */
  readonly surfaces?: readonly CommandSurface[];
}

export type CommandSurface = 'slash' | 'toolbar' | 'keyboard' | 'palette';

export interface NotebookCommand extends CommandMeta {
  /**
   * May this command run / be shown now? Default true. Used to hide commands whose
   * required service is missing or that don't apply to the current selection.
   */
  isAvailable?(ctx: FullCommandContext): boolean;

  /**
   * Toolbar active-state (replaces editor.isActive(...)). E.g. bold button highlight.
   */
  isActive?(ctx: FullCommandContext): boolean;

  /**
   * Dry-run check WITHOUT dispatching. Mirrors PM command convention:
   * a command called with a no-op dispatch must return whether it *could* apply.
   * The registry uses this for enabling/disabling and for chaining.
   */
  canRun?(ctx: FullCommandContext): boolean;

  /**
   * Perform the command. Return true if it handled/applied, false to fall through
   * (PM keymap semantics). May be async for service-backed commands; async
   * commands return a Promise<boolean> and are NEVER used as raw keymap handlers
   * (see §7.2 — they are wrapped).
   */
  run(ctx: FullCommandContext): boolean | Promise<boolean>;
}
```

### 5.1 Authoring helpers

To keep definitions terse and uniform, two factories cover the common cases.

```ts
/** A command that only produces a PM transaction (no services). */
export function txCommand(
  meta: CommandMeta,
  fn: (ctx: FullCommandContext) => Transaction | null,
): NotebookCommand;

/** A command backed by an injected service; declares its dependency for auto-availability. */
export function serviceCommand<K extends keyof NotebookServices>(
  meta: CommandMeta,
  dep: K,
  fn: (ctx: FullCommandContext, svc: NonNullable<NotebookServices[K]>) => boolean | Promise<boolean>,
): NotebookCommand;
// serviceCommand auto-implements isAvailable = () => ctx.services[dep] != null
```

---

## 6. The `CommandRegistry`

One registry, consumed by every surface. It is a plain object owned by `NotebookEditorCore` — no React, no global singleton.

```ts
export interface CommandRegistryOptions {
  /** Resolve i18n + intents + services into a context for a given PM state/view. */
  contextFactory: CommandContextFactory;
  /** Called when a registration conflict occurs. Default: last-wins + warn. */
  onConflict?: (id: string, existing: NotebookCommand, incoming: NotebookCommand) => 'replace' | 'keep' | 'throw';
}

export type CommandContextFactory = (
  args: { state: EditorState; dispatch: CommandDispatch; view?: EditorView; arg?: string },
) => FullCommandContext;

export interface CommandRegistry {
  /** Register one or many. Returns a disposer to unregister (for hot capability swap). */
  register(cmd: NotebookCommand | NotebookCommand[]): () => void;
  unregister(id: string): void;
  get(id: string): NotebookCommand | undefined;
  has(id: string): boolean;

  /**
   * List commands available for a surface, already filtered by isAvailable and
   * (for slash) fuzzy-matched against `query`. The shell renders straight from this.
   */
  list(opts: {
    surface: CommandSurface;
    state: EditorState;
    view?: EditorView;
    query?: string;        // slash query / palette filter
    group?: CommandGroup;  // toolbar may request a single group
  }): ResolvedCommand[];

  /**
   * Run a command by id. Builds the context via contextFactory, runs canRun guard,
   * dispatches, and drains intents. Returns the run result.
   */
  run(id: string, args?: { view?: EditorView; arg?: string; state?: EditorState }): Promise<boolean>;

  /** Build a keymap object { 'Mod-b': handler, ... } from all keybindings. */
  toKeymap(): Record<string, PMKeymapHandler>;

  /** Snapshot for devtools / command palette. */
  all(): readonly NotebookCommand[];
}

/** What `list()` returns — command + resolved presentation/state for the view. */
export interface ResolvedCommand {
  command: NotebookCommand;
  title: string;        // ctx.t-resolved
  description?: string;
  icon?: string;
  active: boolean;      // isActive(ctx)
  enabled: boolean;     // canRun(ctx) ?? true
  score?: number;       // fuzzy-match score for slash ordering
}

/** PM keymap handler shape: (state, dispatch, view) => boolean. */
export type PMKeymapHandler = (
  state: EditorState,
  dispatch?: CommandDispatch,
  view?: EditorView,
) => boolean;
```

### 6.1 Conflict & ordering rules

- **Ids are global and unique.** Capability modules must namespace where collisions are likely (`ai.generate`, `exec.run`). Built-ins use bare ids (`heading-1`, `bullet-list`).
- `register` with an existing id consults `onConflict` (default `'replace'` + console warning in dev). This lets a host *override* a built-in (e.g. replace the default `image` command with one that opens a custom asset browser).
- `list()` ordering: by `group`, then by `score` (slash), else by registration order.

---

## 7. How each surface consumes the registry

### 7.1 Slash menu (replaces `TipTapSlashCommands.tsx` + `useTipTapSlashCommands.ts`)

The detection (regex on the current textblock, `coordsAtPos` positioning) moves into a **PM plugin** (`slashTriggerPlugin`) that owns menu open/query/position in *plugin state*, not React `useState`. The React menu becomes a thin subscriber.

```ts
export interface SlashPluginState {
  open: boolean;
  query: string;       // text after "/"
  range: { from: number; to: number }; // the "/query" span, for removeSlashText
  coords?: { left: number; top: number };
}

// The menu component:
function SlashMenu({ core }: { core: NotebookEditorCore }) {
  const slash = useSlashState(core);               // subscribes to plugin state
  if (!slash.open) return null;
  const items = core.commands.list({
    surface: 'slash',
    state: core.state,
    view: core.view,
    query: slash.query,
  });
  // arrow/enter/tab handled by the plugin's keymap (NOT a document capture listener)
  return <Menu items={items} onPick={(c) => {
    core.dispatchSlash({ type: 'removeRange', range: slash.range }); // delete "/query"
    core.commands.run(c.command.id, { view: core.view, arg: slash.query });
  }} />;
}
```

**Removed:** the inline 13-command array, the document-level capture-phase keydown listener, *and* the duplicate capture listener on `editor.view.dom`. Selection/highlight nav is a keymap registered by `slashTriggerPlugin` only while open. The old `try/catch` raw-HTML fallbacks vanish because commands operate on the schema directly and `isAvailable` already guarantees the needed nodes/services exist.

### 7.2 Keyboard (replaces `useKeyboardHandlers.ts` + the dead `useKeyboardShortcuts.ts`)

A single `keymap(registry.toKeymap())` PM plugin. `toKeymap()` walks every command with a `keybinding` and emits a PM handler:

```ts
function commandToKeymapHandler(cmd: NotebookCommand, factory: CommandContextFactory): PMKeymapHandler {
  return (state, dispatch, view) => {
    const ctx = factory({ state, dispatch: dispatch ?? (() => {}), view });
    if (cmd.canRun && !cmd.canRun(ctx)) return false;
    const r = cmd.run(ctx);
    // Async (service) commands can't block the keymap: kick off, claim handled.
    if (r instanceof Promise) { void r; return true; }
    return r;
  };
}
```

Structural-only behaviors today in `useKeyboardHandlers` (Tab indent, Cmd+Home/End doc nav, Backspace-downgrades-special-node) become first-class `nav`/`block`-group commands with keybindings (`'Tab'`, `'Mod-Home'`, `'Backspace'`), so the hardcoded node-name strings (`'executableCodeBlock'`, `'thinkingCell'`, `'rawBlock'`) live in **one** schema-constants module the commands import — not scattered. The advertised-but-unwired save/undo/redo/run shortcuts become real registry commands (`exec.run` = `Mod-Enter`, `exec.run-all` = `Mod-Shift-Enter`, etc.).

### 7.3 Bubble / toolbar menu (replaces `BubbleMenu.tsx`)

The toolbar renders straight from `registry.list({ surface: 'toolbar', group: 'format', ... })`. `isActive(ctx)` drives the highlight (replacing `editor.isActive('bold')`), `enabled` drives disabling. No inline `toggleBold()` calls; the bubble button's `onClick` is `core.commands.run(c.command.id, { view })`. Heading/list/quote definitions are now **shared** with the slash menu — one definition, two surfaces, selected via `surfaces`.

```tsx
function BubbleToolbar({ core }: { core: NotebookEditorCore }) {
  const items = core.commands.list({ surface: 'toolbar', group: 'format', state: core.state, view: core.view });
  return (
    <Toolbar>
      {items.map((it) => (
        <ToolbarButton
          key={it.command.id}
          icon={it.icon}
          active={it.active}
          disabled={!it.enabled}
          onClick={() => core.commands.run(it.command.id, { view: core.view })}
        />
      ))}
    </Toolbar>
  );
}
```

---

## 8. How external capabilities register commands

A **capability** is a host-provided module that contributes (a) a service implementation and (b) the commands that use it. Capabilities are injected at core construction; the core wires their services into `NotebookServices` and their commands into the registry.

```ts
export interface NotebookCapability {
  readonly name: string;
  /** Service slices this capability provides (merged into NotebookServices). */
  services?: Partial<NotebookServices>;
  /** Commands this capability contributes (registered into the shared registry). */
  commands?(api: CapabilityApi): NotebookCommand[];
  /** Optional PM plugins (e.g. UploadDrop becomes a plugin here, not a separate ad-hoc one). */
  plugins?(api: CapabilityApi): PMPlugin[];
}

export interface CapabilityApi {
  schema: Schema;
  /** Stable cell-id resolution helpers, shared with built-ins. */
  cells: CellLocator;
  /** The OutputPort, so a capability's service can write results back via PM. */
  output: OutputPort;
}
```

### 8.1 Example — execution capability

```ts
export function createExecCapability(transport: ExecTransport): NotebookCapability {
  return {
    name: 'exec',
    services: {
      execution: {
        async execute(cellId, code) {
          // transport hits the HTTP/kernel; writeback via OutputPort (NOT Zustand).
          return transport.run(cellId, code);
        },
        cancel: (cellId) => transport.cancel(cellId),
        status: (cellId) => transport.status(cellId),
      },
    },
    commands: ({ cells }) => [
      serviceCommand(
        { id: 'exec.run', title: 'cmd.run', group: 'exec', keybinding: 'Mod-Enter', icon: 'play' },
        'execution',
        async (ctx, execution) => {
          const cellId = ctx.currentCellId();
          if (!cellId) return false;
          const code = cells.codeOf(ctx.state, cellId);
          await execution.execute(cellId, code); // service writes outputs via OutputPort
          return true;
        },
      ),
      serviceCommand(
        { id: 'exec.run-all', title: 'cmd.runAll', group: 'exec', keybinding: 'Mod-Shift-Enter' },
        'execution',
        async (ctx, execution) => { /* iterate code cells, execute each */ return true; },
      ),
      txCommand(
        { id: 'exec.clear-outputs', title: 'cmd.clearOutputs', group: 'exec' },
        (ctx) => clearOutputsTr(ctx.state), // pure PM transaction, addToHistory:false set by registry
      ),
    ],
  };
}
```

### 8.2 Example — image generation + upload

```ts
export function createImageGenCapability(client: ImageGenClient): NotebookCapability {
  return {
    name: 'imageGen',
    services: { imageGen: { generate: (p, params) => client.generate(p, params) } },
    commands: () => [
      serviceCommand(
        { id: 'ai.image', title: 'cmd.generateImage', group: 'ai', keywords: ['image', 'generate', 'ai'] },
        'imageGen',
        async (ctx, imageGen) => {
          // No window.prompt(): emit an intent; the shell collects the prompt, re-runs with arg.
          if (!ctx.arg) { ctx.intents.emit({ kind: 'openPrompt', field: 'imagePrompt', token: ctx.currentCellId() ?? '' }); return true; }
          const res = await imageGen.generate(ctx.arg);
          if (res.ok && res.value) ctx.services.output /* write image node */;
          return true;
        },
      ),
    ],
  };
}
```

**This is the crux:** `ai.image`, `exec.run`, `upload.file` are only present (and only surface in the slash/toolbar lists) when their capability was injected. Remove the capability → the command auto-disappears, with zero changes to menus, because `list()` filters on `isAvailable`.

---

## 9. Command composition & chaining

A small combinator algebra over `NotebookCommand` (or the lower-level `(ctx) => boolean`). It mirrors PM's `chainCommands` but works on the registry's context and supports async service commands.

```ts
export type CommandFn = (ctx: FullCommandContext) => boolean | Promise<boolean>;

/** Run in order; STOP at the first that returns true (PM keymap fallthrough semantics). */
export function first(...cmds: CommandFn[]): CommandFn;

/** Run ALL in sequence on the SAME accumulating transaction; succeed only if every step applies.
 *  Implemented by threading one Transaction and a capturing dispatch, committing once at the end. */
export function sequence(...cmds: CommandFn[]): CommandFn;

/** Conditional: run `then` when predicate holds, else `otherwise`. */
export function when(pred: (ctx: FullCommandContext) => boolean, then: CommandFn, otherwise?: CommandFn): CommandFn;

/** Run side-effect command without affecting the boolean result (e.g. emit an intent). */
export function tap(fn: (ctx: FullCommandContext) => void): CommandFn;

/** Lift a registered command id into a CommandFn so registry entries compose with raw fns. */
export function byId(id: string): CommandFn;
```

`sequence` is the important one: it threads a single `Transaction` through each step via a *capturing dispatch*, so multi-step commands (e.g. "delete the `/img` text, then insert an image node, then move selection after it") commit as **one undoable transaction** rather than three. Example:

```ts
const insertImageFromSlash = sequence(
  removeSlashRange,                                   // tx step
  byId('image'),                                      // tx step (insert image node)
  tap((ctx) => ctx.intents.emit({ kind: 'scrollIntoView', pos: ctx.selection.to })),
);
```

The registry's `run` and `sequence` set transaction meta uniformly: `tr.setMeta('addToHistory', ...)`, `tr.setMeta('fromExternal', false)`. Service-driven writebacks (outputs, AI append) go through `OutputPort`, which always sets `addToHistory:false` so streaming never pollutes undo.

---

## 10. Mapping the current code onto the new design

| Current (live) | Fate | New home |
|---|---|---|
| `TipTapSlashCommands.tsx` inline 13-command array | **replace** | Built-in `NotebookCommand`s in `core/commands/builtin/*` + slash UI renders from `registry.list({surface:'slash'})` |
| `useTipTapSlashCommands.ts` (regex detect, coords, dup keydown listeners) | **replace** | `slashTriggerPlugin` (PM plugin owning open/query/range/coords); React menu subscribes |
| `BubbleMenu.tsx` inline `toggleBold()` buttons | **replace** | `format`-group commands (`bold`/`italic`/`strike`/`inline-code`/headings/lists/quote); toolbar renders from registry; `isActive` → highlight |
| `useKeyboardHandlers.ts` (Tab/Home/End/Backspace-downgrade, structural) | **port** | `nav`/`block` commands with keybindings; node-name constants centralized; wired via `keymap(registry.toKeymap())` |
| `useKeyboardShortcuts.ts` (DEAD save/undo/redo/run/insert) | **mine + delete** | Surviving ideas become real registry commands (`exec.run`, `doc.save`, history commands); file deleted |
| Code execution via `CodeCellViewModel → useCodeStore.getState().executeCell()` | **invert** | `exec.run` command → `ctx.services.execution.execute()`; service writes back via `OutputPort` (PM tx, `addToHistory:false`) |
| Image upload/gen inside `ImageView` reading `useStore` | **invert** | `ai.image` / `upload.file` commands → `ctx.services.imageGen` / `ctx.services.upload`; NodeView receives injected services, not store |
| `UploadDropExtension.ts` (ad-hoc PM plugin) | **fold in** | `UploadCapability.plugins()` returns the drop/paste plugin; shares `services.upload` + `OutputPort` |
| AI thinking/streaming via `node.attrs` + workflow store | **route** | `ai.generate` command → `services.ai.generate()` returns `AIStreamHandle`; `OutputPort.appendText` does incremental `insertText` (not full-string rewrite) |
| `window.prompt()` for image/video URL | **replace** | `intents.emit({kind:'openPrompt'})`; shell shows UI, re-runs command with `arg` |
| `window` `CustomEvent` cross-cell nav (`markdown-cell-focus`, `cell-navigation`) | **replace** | `nav` commands emitting `intents.emit({kind:'navigateCell'|'focusCell'})`; shell performs DOM focus |
| `useSlashCommands.ts`, `SlashCommandMenu.tsx`, `SlashCommandExtension.tsx`, `ShortcutsHelp.tsx` | **delete (dead)** | — (prerequisite cleanup so the registry has a single source of truth) |

### 10.1 Migration sequencing

1. **Delete the dead command trees** (`useSlashCommands`, `SlashCommandMenu`, `useKeyboardShortcuts`, `SlashCommandExtension`, plus the dead BlockManager/extension duplicates) so only the live path remains.
2. **Introduce `CommandRegistry` + `NotebookCommand` + `CommandContext`** in the core with the built-in `format`/`basic`/`block`/`media` commands (pure `txCommand`s — no services yet). Wire the bubble menu and slash menu to render from the registry. *No behavior change, three duplicated arrays collapse to one.*
3. **Add the keymap plugin** from `registry.toKeymap()`; port `useKeyboardHandlers`' structural behaviors into `nav`/`block` commands.
4. **Define `NotebookServices` + `OutputPort`** and add the `NotebookCapability` injection point to `NotebookEditorCore`. Implement `ExecCapability` first; flip `exec.run` to go through `services.execution`, with writeback via `OutputPort`. Keep the legacy store path behind a flag until parity is confirmed.
5. **Move upload/image-gen/AI** into capabilities; convert `ImageView`/`ThinkingCellView`/`CodeBlockView` to consume injected `services` (via NodeView context) instead of `useStore`/`useCodeStore`. Replace `window.prompt`/`CustomEvent` with `intents`.
6. **Delete the store-coupled paths** (`useEditorSync`/`useEditorEvents` cell round-trip is handled by the separate doc-as-source-of-truth migration; the command layer no longer touches Zustand at all).

---

## 11. Worked end-to-end example

Inserting a code cell from `/code` and running it — entirely through the registry, store-free:

```ts
// 1. Built-in (core, no services): insert an executable code cell.
const insertCodeCell = txCommand(
  { id: 'code', title: 'cmd.code', group: 'block', keywords: ['code', 'python', 'run'],
    keybinding: 'Mod-Alt-c', surfaces: ['slash', 'toolbar', 'keyboard'] },
  (ctx) => insertCodeCellTr(ctx.state, ctx.schema, { cellId: newCellId() }),
);
// run() drains an intent so the shell focuses the new CodeMirror:
//   the tx command also emits intents.emit({ kind:'focusCell', cellId, place:'start' })

// 2. Injected capability (host): run the current cell.
//    exec.run from §8.1 — services.execution.execute → OutputPort.setOutputs.

// 3. Slash menu picks 'code': registry.run('code', { arg }) → tx commits → intent focuses cell.
// 4. User hits Mod-Enter: keymap handler for 'exec.run' fires → service runs → outputs
//    applied with addToHistory:false → undo history untouched, selection preserved.
```

No command in this flow imported Zustand, React, or a live TipTap `Editor`. Both surfaces (slash, keyboard) and the third (toolbar) drew from the same registry; the only thing the host supplied was the `ExecCapability`.

---

## 12. Summary of public types

```ts
// Core, framework-free:
export interface NotebookCommand extends CommandMeta { /* §5 */ }
export interface CommandContext { /* §3 */ }
export type FullCommandContext = CommandContext & CommandContextHelpers;
export interface CommandRegistry { /* §6 */ }
export interface NotebookServices { /* §4 */ }
export interface OutputPort { /* §4 */ }
export interface NotebookCapability { /* §8 */ }
export interface IntentSink { /* §3.1 */ }

// Authoring:
export function txCommand(meta, fn): NotebookCommand;
export function serviceCommand(meta, dep, fn): NotebookCommand;

// Composition:
export function first(...c): CommandFn;
export function sequence(...c): CommandFn;
export function when(pred, then, otherwise?): CommandFn;
export function tap(fn): CommandFn;
export function byId(id): CommandFn;
```

**Invariants:**
1. A `NotebookCommand` imports no Zustand, no React, no `window`, no live TipTap `Editor`.
2. The registry is the single source of truth for all three surfaces (slash/toolbar/keyboard) + the command palette.
3. External capabilities (AI/exec/upload/image-gen) reach the editor *only* through injected `NotebookServices`, and write results back *only* through `OutputPort` (PM transactions, `addToHistory:false`).
4. DOM/cross-cell side effects flow through typed `intents`, drained by the React shell — never via `document.querySelector` or `CustomEvent` inside a command.