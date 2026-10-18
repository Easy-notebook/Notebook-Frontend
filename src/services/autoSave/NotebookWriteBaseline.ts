import type { NotebookSnapshotCondition } from '../persistence/interfaces';

interface Baseline {
  generation: number;
  content: string | null;
}

/** The persisted body on which this instance's edits are based; never rebased on retry. */
export class NotebookWriteBaseline {
  private readonly entries = new Map<string, Baseline>();

  generation(id: string): number {
    return this.entries.get(id)?.generation ?? 0;
  }

  condition(id: string, unobserved: string | null = null): NotebookSnapshotCondition {
    const entry = this.entries.get(id);
    return { expectedContent: entry ? entry.content : unobserved };
  }

  loaded(id: string, generation: number, content: string | null): void {
    const current = this.entries.get(id);
    if (this.generation(id) !== generation && current?.content !== content) {
      throw new Error('Notebook changed while loading');
    }
    this.committed(id, content);
  }

  committed(id: string, content: string | null): void {
    this.entries.set(id, { generation: this.generation(id) + 1, content });
  }
}
