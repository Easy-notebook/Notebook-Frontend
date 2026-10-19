import type { SpreadsheetSnapshot } from './SpreadsheetSnapshot';

export interface SpreadsheetSearchQuery {
  text: string;
  matchCase: boolean;
  wholeCell: boolean;
}

/** A search result belongs to exactly one immutable draft snapshot and query. */
export class SpreadsheetSearch {
  readonly matches: ReadonlyArray<Readonly<{ row: number; col: number }>>;
  private readonly pattern: RegExp;
  readonly query: Readonly<SpreadsheetSearchQuery>;

  constructor(
    readonly source: SpreadsheetSnapshot,
    query: SpreadsheetSearchQuery
  ) {
    this.query = Object.freeze({ ...query });
    const literal = query.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.pattern = new RegExp(
      query.wholeCell ? `^(?:${literal})(?![\\s\\S])` : literal,
      query.matchCase ? 'g' : 'gi'
    );
    const matches: { row: number; col: number }[] = [];
    if (query.text)
      source.data.forEach((row, rowIndex) =>
        source.columns.forEach((column, col) => {
          const original = String(row[column.key] ?? '');
          this.pattern.lastIndex = 0;
          if (this.pattern.test(original)) matches.push(Object.freeze({ row: rowIndex, col }));
        })
      );
    this.matches = Object.freeze(matches);
  }

  replace(replacement: string, index?: number): SpreadsheetSnapshot | null {
    const matches =
      index === undefined ? this.matches : this.matches.filter((_, position) => position === index);
    if (!matches.length) return null;
    let changed = false;
    const data = this.source.data.map((row) => ({ ...row }));
    for (const { row, col } of matches) {
      const key = this.source.columns[col].key;
      const previous = String(data[row][key] ?? '');
      // Replacement is user text, not JavaScript replacement-pattern syntax ($&, $1, ...).
      const next = this.query.wholeCell
        ? replacement
        : previous.replace(this.pattern, () => replacement);
      if (next !== previous) {
        data[row][key] = next;
        changed = true;
      }
    }
    return changed ? { ...this.source, data } : null;
  }
}
