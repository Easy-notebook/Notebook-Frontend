import type { Cell } from '@Store/models';
import type { CellInsertion } from './protocol';

/** Resolves an insertion against one versioned source, without normalizing surrounding Markdown. */
export class CellContentEdit {
  private readonly offset?: number;

  constructor(
    private readonly cell: Pick<Cell, 'type' | 'content'>,
    insertion?: CellInsertion
  ) {
    if (!insertion) return;
    if (cell.type !== 'markdown') throw new Error('Insertion is supported only in Markdown cells');
    const { anchor, position } = insertion;
    const start = cell.content.indexOf(anchor);
    if (!anchor || start < 0)
      throw new Error('ANCHOR_NOT_FOUND: re-read the cell and choose an exact source anchor.');
    if (cell.content.indexOf(anchor, start + 1) !== -1)
      throw new Error('ANCHOR_AMBIGUOUS: include more surrounding text to identify one location.');
    this.offset = start + (position === 'after' ? anchor.length : 0);
  }

  apply(content: string): string {
    const result =
      this.offset === undefined
        ? content
        : this.cell.content.slice(0, this.offset) + content + this.cell.content.slice(this.offset);
    if (result.length > 500_000)
      throw new Error('CELL_TOO_LARGE: resulting content exceeds 500000 characters.');
    return result;
  }
}
