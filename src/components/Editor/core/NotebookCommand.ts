/**
 * Command type + registry (Phase 1 scaffold).
 *
 * ONE registry, later consumed by slash menu, toolbar/bubble menu, and keymap
 * alike (Phase 3 fills in the builtins). Commands receive a `CommandContext`
 * exposing PM state/dispatch + injected `services`. No React, no Zustand, no
 * live TipTap `Editor`, no `editor.isActive`.
 *
 * See docs/migration/00-architecture-and-core-api.md §5.5 and
 * docs/migration/02-command-registry.md.
 */
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { NotebookTransaction } from './NotebookTransaction';
import { NotebookDoc } from './NotebookDoc';
import { NotebookServices } from './ports';

export interface CommandContext {
  state: EditorState;
  dispatch: (tr: NotebookTransaction) => void;
  /** null in headless contexts (no mounted view). View-dependent commands guard. */
  view: EditorView | null;
  schema: Schema;
  services: NotebookServices;
  doc: NotebookDoc;
}

export interface NotebookCommand {
  /** Unique id, e.g. 'insert.codeCell', 'format.h1', 'cell.run'. */
  id: string;
  title: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  group?: string;
  /** Whether the command can run in the current context (default: true). */
  isAvailable?(ctx: CommandContext): boolean;
  /** Whether the command's effect is currently active (toolbar highlight). */
  isActive?(ctx: CommandContext): boolean;
  /** Perform the command. Return false if it did not apply. */
  run(ctx: CommandContext, args?: unknown): boolean;
}

export class CommandRegistry {
  private readonly commands = new Map<string, NotebookCommand>();

  register(command: NotebookCommand): this {
    if (this.commands.has(command.id)) {
      throw new Error(`Duplicate command id: ${command.id}`);
    }
    this.commands.set(command.id, command);
    return this;
  }

  registerAll(commands: NotebookCommand[]): this {
    commands.forEach((c) => this.register(c));
    return this;
  }

  get(id: string): NotebookCommand | undefined {
    return this.commands.get(id);
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  list(): NotebookCommand[] {
    return [...this.commands.values()];
  }

  /** Filter by group and/or fuzzy keyword/title match (slash-menu query). */
  filter(opts: { group?: string; query?: string } = {}): NotebookCommand[] {
    const q = opts.query?.trim().toLowerCase();
    return this.list().filter((c) => {
      if (opts.group && c.group !== opts.group) return false;
      if (!q) return true;
      const hay = [c.title, c.description, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
}
