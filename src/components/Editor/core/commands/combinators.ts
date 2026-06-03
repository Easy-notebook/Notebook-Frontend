/**
 * Command composition combinators (Phase 3).
 *
 * A small algebra over `CommandFn = (ctx) => boolean | Promise<boolean>`,
 * mirroring (but not depending on) PM's chainCommands.
 *
 * The important one is `sequence`: it threads ONE accumulating Transaction
 * through every step via a capturing dispatch, then commits ONCE at the end —
 * so a multi-step command (remove "/img", insert image, move selection) is a
 * SINGLE undoable transaction rather than three.
 *
 * Framework-free: prosemirror-state + relative ./ only.
 *
 * See docs/migration/02-command-registry.md §9.
 */
import { EditorState, Selection, Transaction } from 'prosemirror-state';
import { FullCommandContext, deriveContextHelpers } from '../NotebookCommand';
import { NotebookTransaction } from '../NotebookTransaction';

export type CommandFn = (ctx: FullCommandContext) => boolean | Promise<boolean>;

/** Run in order; STOP at the first that returns true (PM keymap fallthrough). */
export function first(...cmds: CommandFn[]): CommandFn {
  return (ctx) => {
    for (const cmd of cmds) {
      const r = cmd(ctx);
      // An async step that was kicked off claims "handled" (it cannot block the
      // keymap, so a pending Promise counts as truthy and stops fallthrough).
      // Returning the Promise itself lets a Promise<boolean> branch still
      // resolve to its eventual result for non-keymap callers, while ensuring
      // later branches do NOT run (no double side-effects).
      if (r instanceof Promise) return r;
      if (r === true) return true;
    }
    return false;
  };
}

/**
 * Run ALL steps in sequence on the SAME accumulating transaction; succeed only
 * if every step applies. Implemented by threading one Transaction and a
 * capturing dispatch, committing once at the end (a single undo step).
 *
 * Each step sees a context whose `state` reflects the doc AFTER prior steps, so
 * position math is correct, but the underlying Transaction is shared so the
 * whole thing commits atomically.
 */
export function sequence(...cmds: CommandFn[]): CommandFn {
  return (ctx) => {
    const baseState: EditorState = ctx.state;
    const master: Transaction = baseState.tr;
    let current: EditorState = baseState;
    let committed = false;

    for (const cmd of cmds) {
      let captured: Transaction | null = null;
      const stepCtx: FullCommandContext = {
        ...ctx,
        state: current,
        dispatch: (ntx: NotebookTransaction) => {
          captured = ntx.tr;
        },
        ...deriveContextHelpers(current),
      };
      const r = cmd(stepCtx);
      if (r instanceof Promise) {
        // Async steps cannot participate in the shared-tr threading; treat the
        // sequence as a failure to keep transactional integrity.
        return false;
      }
      if (!r) return false;
      if (captured) {
        // Re-apply this step's steps onto the master transaction so the whole
        // sequence is one undo unit.
        const stepTr = captured as Transaction;
        for (const step of stepTr.steps) master.step(step);
        // Map the step's selection onto the master and advance the working state.
        current = current.apply(stepTr);
        committed = true;
      }
    }

    if (!committed) return false;
    // `current.selection` is ALREADY expressed in final-doc coordinates
    // (each step did `current = current.apply(stepTr)`), and `master.doc`
    // is structurally identical to `current.doc` because the same steps were
    // applied in the same order. Re-mapping `current.selection` a second time
    // through the full accumulated `master.mapping` would shift positions
    // forward by the total inserted length again and overflow the document
    // (RangeError). Instead, transplant the already-final selection onto the
    // master doc directly by re-reading it from JSON against master.doc.
    master.setSelection(Selection.fromJSON(master.doc, current.selection.toJSON()));
    ctx.dispatch(new NotebookTransaction(master));
    return true;
  };
}

/** Conditional: run `then` when predicate holds, else `otherwise`. */
export function when(
  pred: (ctx: FullCommandContext) => boolean,
  then: CommandFn,
  otherwise?: CommandFn
): CommandFn {
  return (ctx) => {
    if (pred(ctx)) return then(ctx);
    return otherwise ? otherwise(ctx) : false;
  };
}

/** Run a side-effect (e.g. emit an intent) without affecting the boolean result. */
export function tap(fn: (ctx: FullCommandContext) => void): CommandFn {
  return (ctx) => {
    fn(ctx);
    return true;
  };
}

/**
 * Lift a registered command id into a CommandFn so registry entries compose
 * with raw fns. Resolution is lazy via the provided getter (avoids a hard
 * dependency on a registry instance at module load).
 */
export function byId(resolve: (id: string) => CommandFn | undefined, id: string): CommandFn {
  return (ctx) => {
    const fn = resolve(id);
    if (!fn) return false;
    return fn(ctx);
  };
}
