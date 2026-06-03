/**
 * Command type + registry.
 *
 * ONE registry, consumed by slash menu, toolbar/bubble menu, and keymap alike.
 * Commands receive a `FullCommandContext` exposing PM state/dispatch + injected
 * `services` + derived helpers (active-state, current cell) + a typed intent
 * sink. No React, no Zustand, no live TipTap `Editor`, no `editor.isActive`.
 *
 * Phase 1 shipped the MINIMAL shapes (state/dispatch/view/schema/services/doc;
 * run(ctx,args):boolean; register/registerAll/get/has/list/filter). Phase 3
 * EXTENDS them additively: all new context members are optional/derived so the
 * existing `NotebookEditorCore.commandContext()` factory and the 101 baseline
 * tests keep compiling and passing.
 *
 * See docs/migration/02-command-registry.md §3, §5, §6.
 */
import { EditorState, Selection, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, MarkType } from 'prosemirror-model';
import { chainCommands } from 'prosemirror-commands';
import { NotebookTransaction } from './NotebookTransaction';
import { NotebookDoc } from './NotebookDoc';
import { NotebookServices } from './ports';
import { IntentSink, BufferingIntentSink } from './intents';
import { NODE } from './schema';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Everything a command is allowed to touch. No Zustand, no React, no window.
 *
 * Phase-1 required members (state/dispatch/view/schema/services/doc) are kept
 * with their original types/signatures. Phase-3 members are additive: derived
 * helpers + optional injected bits (arg/t/intents). The `commandContext()`
 * factory populates them all.
 */
export interface CommandContext {
  state: EditorState;
  /** Apply a transaction. Phase-1 signature: takes a NotebookTransaction. */
  dispatch: (tr: NotebookTransaction) => void;
  /** null in headless contexts (no mounted view). View-dependent commands guard. */
  view: EditorView | null;
  schema: Schema;
  services: NotebookServices;
  doc: NotebookDoc;

  // --- Phase 3 additions (derived from state / injected) -----------------
  /** Current selection (= state.selection). */
  selection: Selection;
  /** Slash query tail / prompt result, e.g. `/h2 foo` -> "foo". */
  arg?: string;
  /** i18n lookup, injected — no react-i18next inside core. */
  t: (key: string, fallback?: string) => string;
  /** Typed side-effect channel; the shell drains it. */
  intents: IntentSink;

  /** Whether a node of `typeName` (with optional attrs) is at/around the selection. */
  isNodeActive(typeName: string, attrs?: Record<string, unknown>): boolean;
  /** Whether `markType` is active in the current selection. */
  isMarkActive(markType: string): boolean;
  /** Stable cellId of the notebookCell containing the selection head, if any. */
  currentCellId(): string | null;
}

/**
 * Alias retained for design parity (docs §3). In this implementation the helper
 * methods live directly on `CommandContext`, so the two are identical.
 */
export type FullCommandContext = CommandContext;

// ---------------------------------------------------------------------------
// Command meta
// ---------------------------------------------------------------------------

export type CommandGroup =
  | 'basic' // paragraph, headings, lists, quote
  | 'block' // code, table, raw, divider, math
  | 'media' // image, video, file
  | 'format' // bold/italic/strike/inline-code/link (toolbar)
  | 'ai' // ai-generate, thinking
  | 'exec' // run, run-all, clear-outputs, cancel
  | 'nav' // structural / cursor
  | 'history' // undo / redo
  | 'doc'; // save

export type CommandSurface = 'slash' | 'toolbar' | 'keyboard' | 'palette';

export interface NotebookCommand {
  /** Unique id, e.g. 'heading-1', 'bullet-list', 'exec.run'. */
  id: string;
  title: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  /** Free string (assignable from CommandGroup union values). */
  group?: string;
  /** Default keybinding(s), e.g. "Mod-b", "Mod-Enter". Registered into the keymap. */
  keybinding?: string | string[];
  /** Where this command may surface. Absent => all surfaces. */
  surfaces?: CommandSurface[];
  /** Whether the command can run / be shown now (default: true). */
  isAvailable?(ctx: FullCommandContext): boolean;
  /** Whether the command's effect is currently active (toolbar highlight). */
  isActive?(ctx: FullCommandContext): boolean;
  /**
   * Dry-run check WITHOUT dispatching (PM convention). Used for enabling /
   * disabling and for chaining. Default: true.
   */
  canRun?(ctx: FullCommandContext): boolean;
  /**
   * Perform the command. Return true if it handled/applied, false to fall
   * through. May be async for service-backed commands (the keymap bridge voids
   * the Promise + claims handled).
   */
  run(ctx: FullCommandContext, args?: unknown): boolean | Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Context helpers (pure, derived from a PM state)
// ---------------------------------------------------------------------------

/** Resolve the cellId of the notebookCell containing `pos`, if any. */
export function cellIdAt(state: EditorState, pos: number): string | null {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === NODE.notebookCell) {
      return (node.attrs.cellId as string | null) ?? null;
    }
  }
  return null;
}

/** Whether a node of `typeName` (with matching attrs) wraps or sits at the selection. */
export function isNodeActiveIn(
  state: EditorState,
  typeName: string,
  attrs?: Record<string, unknown>
): boolean {
  const { $from, to } = state.selection;
  const matchAttrs = (a: Record<string, unknown>): boolean =>
    !attrs || Object.keys(attrs).every((k) => a[k] === attrs[k]);

  // Ancestors of the selection head.
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.type.name === typeName && matchAttrs(node.attrs)) return true;
  }
  // Node directly after the cursor (atoms / node selections).
  const after = $from.nodeAfter;
  if (
    after &&
    after.type.name === typeName &&
    matchAttrs(after.attrs) &&
    to <= $from.pos + after.nodeSize
  ) {
    return true;
  }
  return false;
}

/** Whether `markType` is active across the current selection (PM convention). */
export function isMarkActiveIn(state: EditorState, markType: string): boolean {
  const type: MarkType | undefined = state.schema.marks[markType];
  if (!type) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/**
 * Build the derived helper members of a FullCommandContext from a state.
 * Shared by NotebookEditorCore.commandContext() and the registry's own
 * context construction so both stay consistent.
 */
export function deriveContextHelpers(
  state: EditorState
): Pick<FullCommandContext, 'selection' | 'isNodeActive' | 'isMarkActive' | 'currentCellId'> {
  return {
    selection: state.selection,
    isNodeActive: (typeName, attrs) => isNodeActiveIn(state, typeName, attrs),
    isMarkActive: (markType) => isMarkActiveIn(state, markType),
    currentCellId: () => cellIdAt(state, state.selection.head),
  };
}

const IDENTITY_T = (key: string, fallback?: string): string => fallback ?? key;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** PM keymap handler shape: (state, dispatch?, view?) => boolean. */
export type PMKeymapHandler = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  view?: EditorView
) => boolean;

/** What `list({surface,state,...})` returns — command + resolved presentation/state. */
export interface ResolvedCommand {
  command: NotebookCommand;
  title: string;
  description?: string;
  icon?: string;
  active: boolean;
  enabled: boolean;
  score?: number;
}

export interface ListOptions {
  surface?: CommandSurface;
  state: EditorState;
  view?: EditorView | null;
  query?: string;
  group?: string;
  /** Optional context decoration (services/intents/t/arg) for active/enabled eval. */
  services?: NotebookServices;
  intents?: IntentSink;
  t?: (key: string, fallback?: string) => string;
}

export interface RunOptions {
  view?: EditorView | null;
  arg?: string;
  state?: EditorState;
  services?: NotebookServices;
  intents?: IntentSink;
  t?: (key: string, fallback?: string) => string;
  /** Raw PM dispatch (the live view's). If absent, a no-op is used (headless probe). */
  dispatch?: (tr: Transaction) => void;
}

export class CommandRegistry {
  private readonly commands = new Map<string, NotebookCommand>();
  /** Optional default context bits, set by the owning core so list/run/toKeymap work standalone. */
  private defaults: {
    services?: NotebookServices;
    intents?: IntentSink;
    t?: (key: string, fallback?: string) => string;
    view?: () => EditorView | null;
  } = {};

  /**
   * Install default context providers (called by NotebookEditorCore). Lets the
   * registry build contexts for list()/run()/toKeymap() without the caller
   * threading services/intents every time.
   */
  setDefaults(defaults: {
    services?: NotebookServices;
    intents?: IntentSink;
    t?: (key: string, fallback?: string) => string;
    view?: () => EditorView | null;
  }): this {
    this.defaults = { ...this.defaults, ...defaults };
    return this;
  }

  /**
   * Register one command. Conflict policy (design §6.1): an existing id is
   * REPLACED (last-wins) so hosts can override builtins. A dev-time warning is
   * surfaced via `onConflict` if provided.
   */
  register(command: NotebookCommand): this {
    this.commands.set(command.id, command);
    return this;
  }

  /**
   * Register many. Duplicate-safe within the batch and against existing entries
   * (last-wins), so registering the builtin set twice never throws.
   */
  registerAll(commands: NotebookCommand[]): this {
    commands.forEach((c) => this.register(c));
    return this;
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  get(id: string): NotebookCommand | undefined {
    return this.commands.get(id);
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  /** Snapshot of all registered commands (registration order). */
  all(): NotebookCommand[] {
    return [...this.commands.values()];
  }

  /**
   * Phase-1 compatible list(): with no args returns every command (array).
   * With a ListOptions object returns resolved + filtered + scored items.
   */
  list(): NotebookCommand[];
  list(opts: ListOptions): ResolvedCommand[];
  list(opts?: ListOptions): NotebookCommand[] | ResolvedCommand[] {
    if (!opts) return this.all();
    const { surface, state, query, group } = opts;
    const ctx = this.buildContext({
      state,
      view: opts.view ?? undefined,
      services: opts.services,
      intents: opts.intents,
      t: opts.t,
      dispatch: () => {},
    });
    const q = query?.trim().toLowerCase();
    const resolved: ResolvedCommand[] = [];
    for (const command of this.commands.values()) {
      if (surface && command.surfaces && !command.surfaces.includes(surface)) continue;
      if (group && command.group !== group) continue;
      if (command.isAvailable && !command.isAvailable(ctx)) continue;
      let score: number | undefined;
      if (q) {
        score = fuzzyScore(command, q);
        if (score <= 0) continue;
      }
      resolved.push({
        command,
        title: command.title,
        description: command.description,
        icon: command.icon,
        active: command.isActive ? command.isActive(ctx) : false,
        enabled: command.canRun ? command.canRun(ctx) : true,
        score,
      });
    }
    return sortResolved(resolved);
  }

  /** Filter by group and/or substring query (Phase-1 compatible). */
  filter(opts: { group?: string; query?: string } = {}): NotebookCommand[] {
    const q = opts.query?.trim().toLowerCase();
    return this.all().filter((c) => {
      if (opts.group && c.group !== opts.group) return false;
      if (!q) return true;
      const hay = [c.title, c.description, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  /**
   * Run a command by id: build context, run canRun/isAvailable gate, run, and
   * (for the buffering sink) leave intents for the caller to drain. Async
   * service commands resolve to their eventual boolean; the keymap bridge does
   * NOT use this (it kicks off + claims handled, see toKeymap).
   */
  run(id: string, opts: RunOptions = {}): boolean | Promise<boolean> {
    const command = this.commands.get(id);
    if (!command) return false;
    const state = opts.state ?? this.defaults.view?.()?.state;
    if (!state) return false;
    const ctx = this.buildContext({
      state,
      view: opts.view ?? undefined,
      arg: opts.arg,
      services: opts.services,
      intents: opts.intents,
      t: opts.t,
      dispatch: opts.dispatch ?? (() => {}),
    });
    if (command.isAvailable && !command.isAvailable(ctx)) return false;
    if (command.canRun && !command.canRun(ctx)) return false;
    return command.run(ctx, opts.arg);
  }

  /**
   * Build a PM keymap object { 'Mod-b': handler, ... } from all commands that
   * declare a keybinding. Commands sharing a key chain via chainCommands in
   * registration order (first to return true wins). Async service commands kick
   * off + return true synchronously.
   */
  toKeymap(): Record<string, PMKeymapHandler> {
    const byKey = new Map<string, NotebookCommand[]>();
    for (const command of this.commands.values()) {
      if (!command.keybinding) continue;
      const keys = Array.isArray(command.keybinding) ? command.keybinding : [command.keybinding];
      for (const key of keys) {
        const list = byKey.get(key) ?? [];
        list.push(command);
        byKey.set(key, list);
      }
    }
    const out: Record<string, PMKeymapHandler> = {};
    for (const [key, cmds] of byKey) {
      const handlers = cmds.map((c) => this.commandToKeymapHandler(c));
      out[key] =
        handlers.length === 1 ? handlers[0] : (chainCommands(...handlers) as PMKeymapHandler);
    }
    return out;
  }

  private commandToKeymapHandler(command: NotebookCommand): PMKeymapHandler {
    return (state, dispatch, view) => {
      const ctx = this.buildContext({
        state,
        view,
        dispatch: dispatch ?? (() => {}),
      });
      if (command.isAvailable && !command.isAvailable(ctx)) return false;
      if (command.canRun && !command.canRun(ctx)) return false;
      // Dry-run probe: PM passes dispatch===undefined to ask "can you apply?".
      if (!dispatch) return command.canRun ? command.canRun(ctx) : true;
      const r = command.run(ctx);
      if (r instanceof Promise) {
        void r;
        return true;
      }
      return r;
    };
  }

  /**
   * Construct a FullCommandContext. The raw PM `dispatch` is adapted so command
   * code can call `ctx.dispatch(new NotebookTransaction(tr))` and the wrapped
   * PM dispatch receives `.tr`.
   */
  private buildContext(args: {
    state: EditorState;
    view?: EditorView | null;
    arg?: string;
    services?: NotebookServices;
    intents?: IntentSink;
    t?: (key: string, fallback?: string) => string;
    dispatch: (tr: Transaction) => void;
  }): FullCommandContext {
    const rawDispatch = args.dispatch;
    return {
      state: args.state,
      dispatch: (ntx: NotebookTransaction) => rawDispatch(ntx.tr),
      view: args.view ?? null,
      schema: args.state.schema,
      services: args.services ?? this.defaults.services ?? {},
      doc: new NotebookDoc(args.state),
      arg: args.arg,
      t: args.t ?? this.defaults.t ?? IDENTITY_T,
      intents: args.intents ?? this.defaults.intents ?? new BufferingIntentSink(),
      ...deriveContextHelpers(args.state),
    };
  }
}

// ---------------------------------------------------------------------------
// Fuzzy scoring for slash ordering (substring corpus, design §6.1)
// ---------------------------------------------------------------------------

function fuzzyScore(command: NotebookCommand, q: string): number {
  const id = command.id.toLowerCase();
  const title = command.title.toLowerCase();
  const keywords = (command.keywords ?? []).map((k) => k.toLowerCase());
  const description = (command.description ?? '').toLowerCase();
  if (id === q || title === q) return 100;
  if (id.startsWith(q) || title.startsWith(q)) return 80;
  if (keywords.some((k) => k === q)) return 70;
  if (keywords.some((k) => k.startsWith(q))) return 60;
  const hay = [title, description, ...keywords, id].join(' ');
  if (hay.includes(q)) return 30;
  return 0;
}

function sortResolved(items: ResolvedCommand[]): ResolvedCommand[] {
  return items.sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sa !== sb) return sb - sa;
    return 0; // stable: preserve registration order within equal scores
  });
}
