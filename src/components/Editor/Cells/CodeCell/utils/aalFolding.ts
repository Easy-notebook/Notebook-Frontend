import { StateField, type Text } from '@codemirror/state';
import { foldService } from '@codemirror/language';

type Block = { from: number; to: number };
/** Index indentation suites once per document revision; gutter lookups stay O(1).
 * Bracket continuations, strings and comments do not introduce suites.
 */
function indexBlocks(doc: Text, tabSize: number): Map<number, Block> {
  const lines: Array<{ start: number; end: number; indent: number; headerEnd: number }> = [];
  let depth = 0;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const text = line.text;
    if (!text.trim() || text.trimStart().startsWith('#')) continue;
    if (depth === 0) {
      let indent = 0;
      for (const char of text) {
        if (char === ' ') indent++;
        else if (char === '\t') indent += tabSize - (indent % tabSize);
        else break;
      }
      lines.push({ start: line.from, end: line.to, headerEnd: line.to, indent });
    } else if (lines.length) {
      lines[lines.length - 1].end = line.to;
      lines[lines.length - 1].headerEnd = line.to;
    }
    let quoted = false;
    let escaped = false;
    for (const char of text) {
      if (quoted) {
        if (char === '"' && !escaped) quoted = false;
        escaped = char === '\\' && !escaped;
      } else if (char === '#') break;
      else if (char === '"') quoted = true;
      else if ('([{'.includes(char)) depth++;
      else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    }
  }
  const ranges = new Map<number, Block>();
  const stack: typeof lines = [];
  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    while (stack.length && (!line || line.indent <= stack[stack.length - 1].indent)) {
      const header = stack.pop()!;
      const end = lines[i - 1].end;
      if (end > header.headerEnd) ranges.set(header.start, { from: header.headerEnd, to: end });
    }
    if (line && lines[i + 1]?.indent > line.indent) stack.push(line);
  }
  return ranges;
}
const blocks = StateField.define<Map<number, Block>>({
  create: (state) => indexBlocks(state.doc, state.tabSize),
  update: (value, transaction) =>
    transaction.docChanged || transaction.startState.tabSize !== transaction.state.tabSize
      ? indexBlocks(transaction.state.doc, transaction.state.tabSize)
      : value,
});
export const aalFolding = [
  blocks,
  foldService.of((state, from) => state.field(blocks).get(from) ?? null),
];
