/** Maps visible row order to source coordinates used by drafts, formatting and persistence. */
export class SpreadsheetRowOrder {
  private readonly rows: readonly number[];
  private readonly positions: ReadonlyMap<number, number>;

  constructor(rows: readonly number[]) {
    this.rows = [...rows];
    this.positions = new Map(rows.map((source, position) => [source, position]));
  }

  offset(source: number, delta: number): number | null {
    const position = this.positions.get(source);
    return position === undefined ? null : (this.rows[position + delta] ?? null);
  }

  move(source: number, delta: number): number {
    return this.offset(source, delta) ?? source;
  }

  between(first: number, last: number): readonly number[] {
    const start = this.positions.get(first);
    const end = this.positions.get(last);
    if (start === undefined || end === undefined) return [];
    return this.rows.slice(Math.min(start, end), Math.max(start, end) + 1);
  }
}
