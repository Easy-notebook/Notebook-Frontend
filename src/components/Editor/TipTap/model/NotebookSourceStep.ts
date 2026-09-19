import { Step, StepMap, StepResult } from '@tiptap/pm/transform';
import type { Node } from '@tiptap/pm/model';
import type { Cell } from '@Store/models';
import { reconcileCells } from './reconcileCells';

/** ID-addressed store content travels with ProseMirror history, independently of positions. */
export class NotebookSourceStep extends Step {
  constructor(
    readonly before: readonly Cell[],
    readonly after: readonly Cell[],
    private readonly retained = new Map<string, Cell>()
  ) {
    super();
  }
  apply(doc: Node): StepResult {
    return StepResult.ok(doc);
  }
  getMap(): StepMap {
    return StepMap.empty;
  }
  invert(): NotebookSourceStep {
    return new NotebookSourceStep(this.after, this.before, this.retained);
  }
  map(): NotebookSourceStep {
    return this;
  }
  captureLive(live: ReadonlyMap<string, Cell>): void {
    for (const cell of this.before) {
      const current = live.get(cell.id);
      if (current) this.retained.set(cell.id, current);
    }
  }
  retainedCell(id: string): Cell | undefined {
    return this.retained.get(id);
  }
  toJSON() {
    return {
      stepType: 'notebookSourceCells',
      before: this.before,
      after: this.after,
      retained: [...this.retained.values()],
    };
  }
  static fromJSON(_schema: unknown, json: { before: Cell[]; after: Cell[]; retained?: Cell[] }) {
    return new NotebookSourceStep(
      json.before,
      json.after,
      new Map((json.retained || []).map((cell) => [cell.id, cell]))
    );
  }
}
Step.jsonID('notebookSourceCells', NotebookSourceStep);

export function reconcileSourceTransaction(
  projected: Cell[],
  stored: Cell[],
  steps: readonly Step[]
): Cell[] {
  const next = reconcileCells(projected, stored);
  if (!steps.some((step) => step instanceof NotebookSourceStep)) return next;
  const targets = new Map<string, Cell>();
  const retained = new Map<string, Cell>();
  const live = new Map(stored.map((cell) => [cell.id, cell]));
  for (const step of steps) {
    if (step instanceof NotebookSourceStep) {
      step.captureLive(live);
      for (const cell of step.after) {
        targets.set(cell.id, cell);
        const saved = step.retainedCell(cell.id);
        if (saved) retained.set(cell.id, saved);
      }
    }
  }
  if (!targets.size) return next;
  return next.map((cell) => {
    const target = targets.get(cell.id);
    if (!target) return cell;
    const current = live.get(cell.id) ?? retained.get(cell.id) ?? target;
    return {
      ...target,
      ...cell,
      ...current,
      type: target.type,
      content: target.content,
      language: target.language,
      outputs: current.outputs,
      metadata: {
        ...target.metadata,
        ...current.metadata,
        editorMode: target.metadata?.editorMode,
        sourceCellType: target.metadata?.sourceCellType,
      },
    };
  });
}
