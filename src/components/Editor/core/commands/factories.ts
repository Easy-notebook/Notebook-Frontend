/**
 * Command authoring factories (Phase 3).
 *
 * `txCommand` — a command that produces a single PM Transaction (or null to
 * fall through). The factory wraps the returned Transaction in a
 * NotebookTransaction before calling ctx.dispatch (Phase-1 dispatch wants a
 * NotebookTransaction, NOT a raw PM Transaction — the single most likely bug).
 * Its canRun runs the builder against state without dispatching.
 *
 * `serviceCommand` — a command backed by an injected service; auto-implements
 * isAvailable = () => ctx.services[dep] != null so absent capabilities are
 * hidden from menus and fall through in the keymap.
 *
 * Framework-free: prosemirror-state + relative ./ only.
 *
 * See docs/migration/02-command-registry.md §5.1.
 */
import { Transaction } from 'prosemirror-state';
import {
  NotebookCommand,
  FullCommandContext,
  CommandGroup,
  CommandSurface,
} from '../NotebookCommand';
import { NotebookTransaction } from '../NotebookTransaction';
import { NotebookServices } from '../ports';

/** Meta accepted by the authoring factories. */
export interface CommandMeta {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  group?: CommandGroup | string;
  keywords?: string[];
  keybinding?: string | string[];
  surfaces?: CommandSurface[];
  isActive?(ctx: FullCommandContext): boolean;
}

function applyMeta(cmd: NotebookCommand, meta: CommandMeta): NotebookCommand {
  cmd.title = meta.title;
  cmd.description = meta.description;
  cmd.icon = meta.icon;
  cmd.group = meta.group;
  cmd.keywords = meta.keywords;
  cmd.keybinding = meta.keybinding;
  cmd.surfaces = meta.surfaces;
  if (meta.isActive) cmd.isActive = meta.isActive;
  return cmd;
}

/** A command that only produces a PM transaction (no services). */
export function txCommand(
  meta: CommandMeta,
  fn: (ctx: FullCommandContext) => Transaction | null
): NotebookCommand {
  const cmd: NotebookCommand = {
    id: meta.id,
    title: meta.title,
    canRun: (ctx) => fn(ctx) != null,
    run: (ctx) => {
      const tr = fn(ctx);
      if (!tr) return false;
      ctx.dispatch(new NotebookTransaction(tr));
      return true;
    },
  };
  return applyMeta(cmd, meta);
}

/** A command backed by an injected service; declares its dependency for auto-availability. */
export function serviceCommand<K extends keyof NotebookServices>(
  meta: CommandMeta,
  dep: K,
  fn: (ctx: FullCommandContext, svc: NonNullable<NotebookServices[K]>) => boolean | Promise<boolean>
): NotebookCommand {
  const cmd: NotebookCommand = {
    id: meta.id,
    title: meta.title,
    isAvailable: (ctx) => ctx.services[dep] != null,
    run: (ctx) => {
      const svc = ctx.services[dep];
      if (svc == null) return false;
      return fn(ctx, svc as NonNullable<NotebookServices[K]>);
    },
  };
  return applyMeta(cmd, meta);
}
