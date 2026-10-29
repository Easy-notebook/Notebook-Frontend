import type { Cell } from '@Store/models';
import { TranscriptCellDocument } from './TranscriptCellDocument';

/** Reading groups are a projection; cell identity, ordering and persistence stay untouched. */
export class TranscriptActivitySequence {
  private static cache = new WeakMap<readonly Cell[], Map<string, TranscriptActivitySequence>>();
  static project(cells: readonly Cell[]): ReadonlyMap<string, TranscriptActivitySequence> {
    const cached = this.cache.get(cells);
    if (cached) return cached;
    const groups = new Map<string, TranscriptActivitySequence>();
    let sequence: TranscriptActivitySequence | undefined;
    for (const cell of cells) {
      if (!TranscriptCellDocument.read(cell)?.activity) {
        sequence = undefined;
        continue;
      }
      if (!sequence) sequence = new TranscriptActivitySequence();
      sequence.cells.push(cell);
      groups.set(cell.id, sequence);
    }
    this.cache.set(cells, groups);
    return groups;
  }
  readonly cells: Cell[] = [];
  /** Explicit export ownership only: unrelated background notices remain sequence-level. */
  get steps(): { call: Cell; context: Cell[] }[] {
    const steps = this.cells
      .filter((cell) => cell.metadata?.transcriptRole === 'tool')
      .map((call) => ({ call, context: [] as Cell[] }));
    for (const cell of this.cells) {
      if (cell.metadata?.transcriptRole === 'tool') continue;
      const owner = steps.find(
        (step) =>
          (cell.metadata?.toolCallId === step.call.metadata?.toolCallId &&
            !!cell.metadata?.toolCallId) ||
          (cell.metadata?.messageId === step.call.metadata?.messageId && !!cell.metadata?.messageId)
      );
      owner?.context.push(cell);
    }
    return steps;
  }
  get entries(): { call?: Cell; context: Cell[]; ordinal?: number }[] {
    const steps = this.steps;
    const byId = new Map(
      steps.map((step, index) => [step.call.id, { ...step, ordinal: index + 1 }])
    );
    const attached = new Set(steps.flatMap((step) => step.context.map((cell) => cell.id)));
    const entries: { call?: Cell; context: Cell[]; ordinal?: number }[] = [];
    for (const cell of this.cells) {
      const step = byId.get(cell.id);
      if (step) entries.push(step);
      else if (!attached.has(cell.id)) {
        const previous = entries[entries.length - 1];
        if (previous && !previous.call) previous.context.push(cell);
        else entries.push({ context: [cell] });
      }
    }
    return entries;
  }
  get id() {
    return this.cells[0].id;
  }
  get calls() {
    return this.cells.filter((cell) => cell.metadata?.transcriptRole === 'tool').length;
  }
  get outputs() {
    return this.cells.reduce((count, cell) => count + (cell.outputs?.length ?? 0), 0);
  }
}
