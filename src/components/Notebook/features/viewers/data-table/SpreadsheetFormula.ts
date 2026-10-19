import { getExcelColumnName } from './SpreadsheetCoordinates';
import type { GridStructureEdit } from './SpreadsheetSnapshot';

const identifier = /^[\p{L}\p{N}_.$\\]+/u;
const qualifier = /^(?:'(?:[^']|'')*'|(?:\[[^\]]+\])?[\p{L}\p{N}_.\\]+(?::[\p{L}\p{N}_.\\]+)?)!/u;
const reference =
  /^(?:\$?[A-Za-z]{1,3}\$?[1-9]\d*(?:\s*:\s*\$?[A-Za-z]{1,3}\$?[1-9]\d*)?|\$?[A-Za-z]{1,3}\s*:\s*\$?[A-Za-z]{1,3}|\$?[1-9]\d*\s*:\s*\$?[1-9]\d*)/;
const boundary = /[\p{L}\p{N}_.$\\[!]/u;

interface Address {
  column?: number;
  row?: number;
  absoluteColumn: boolean;
  absoluteRow: boolean;
}

function address(text: string): Address | null {
  const match = /^(\$?)([A-Za-z]+)?(\$?)(\d+)?$/.exec(text);
  if (!match) return null;
  const column = match[2]
    ? Array.from(match[2].toUpperCase()).reduce(
        (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
        0
      ) - 1
    : undefined;
  const row = match[4] ? Number(match[4]) - 1 : undefined;
  if ((column !== undefined && column >= 16384) || (row !== undefined && row >= 1048576))
    return null;
  return {
    column,
    row,
    absoluteColumn: Boolean(match[1] && match[2]),
    absoluteRow: Boolean(match[3] || (match[1] && !match[2])),
  };
}

function print(value: Address): string {
  return (
    (value.column === undefined
      ? ''
      : `${value.absoluteColumn ? '$' : ''}${getExcelColumnName(value.column)}`) +
    (value.row === undefined ? '' : `${value.absoluteRow ? '$' : ''}${value.row + 1}`)
  );
}

function transform(referenceText: string, edit: GridStructureEdit): string {
  const parts = referenceText.split(':').map((part) => part.trim());
  const first = address(parts[0]);
  const last = parts[1] ? address(parts[1]) : null;
  if (!first || (parts[1] && !last)) return referenceText;
  const axis = edit.axis;
  if (first[axis] === undefined) return referenceText;
  const map = (index: number): number | null =>
    edit.kind === 'insert'
      ? index >= edit.index
        ? index + 1
        : index
      : index === edit.index
        ? null
        : index > edit.index
          ? index - 1
          : index;
  if (last && last[axis] !== undefined) {
    const ascending = first[axis]! <= last[axis]!;
    const low = ascending ? first : last;
    const high = ascending ? last : first;
    low[axis] = map(low[axis]!) ?? edit.index;
    high[axis] = map(high[axis]!) ?? edit.index - 1;
    if (low[axis]! > high[axis]!) return '#REF!';
  } else {
    const mapped = map(first[axis]!);
    if (mapped === null) return '#REF!';
    first[axis] = mapped;
  }
  const limit = axis === 'row' ? 1048576 : 16384;
  if (first[axis]! >= limit || (last?.[axis] !== undefined && last[axis]! >= limit)) return '#REF!';
  return last ? `${print(first)}:${print(last)}` : print(first);
}

/** Rewrite A1 references while treating strings, identifiers and structured references as opaque tokens. */
export function transformSpreadsheetFormula(
  formula: string,
  formulaSheet: string,
  editedSheet: string,
  edit: GridStructureEdit
): string {
  let output = '';
  let index = 0;
  while (index < formula.length) {
    const remaining = formula.slice(index);
    if (remaining[0] === '"') {
      const token = /^"(?:[^"]|"")*"/.exec(remaining)?.[0] ?? remaining;
      output += token;
      index += token.length;
      continue;
    }
    const prefix = qualifier.exec(remaining)?.[0] ?? '';
    const start = index + prefix.length;
    const token = reference.exec(formula.slice(start))?.[0];
    const after = formula[start + (token?.length ?? 0)] ?? '';
    if (token && !boundary.test(after) && !/^\s*\(/.test(formula.slice(start + token.length))) {
      const sheet = prefix
        ? prefix.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'")
        : formulaSheet;
      // External workbook and 3D sheet references have distinct semantics.
      const applies =
        !sheet.includes('[') &&
        !sheet.includes(':') &&
        sheet.toLowerCase() === editedSheet.toLowerCase();
      output += prefix + (applies ? transform(token, edit) : token);
      index = start + token.length;
      continue;
    }
    if (prefix) {
      output += prefix;
      index += prefix.length;
      continue;
    }
    if (remaining[0] === '[') {
      let depth = 0;
      let length = 0;
      do {
        const char = remaining[length++];
        if (char === '[') depth++;
        if (char === ']') depth--;
      } while (length < remaining.length && depth > 0);
      output += remaining.slice(0, length);
      index += length;
      continue;
    }
    const opaque = identifier.exec(remaining)?.[0] ?? remaining[0];
    output += opaque;
    index += opaque.length;
  }
  return output;
}
