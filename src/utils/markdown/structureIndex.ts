import { Lexer, Marked } from 'marked';
import { tableSourceTokenizer } from './tableBoundary';

interface SourceCell {
  id: string;
  type: string;
  content: string;
}
export type StructuralBlock =
  | { type: 'heading'; depth: number; text: string }
  | { type: 'content' };
interface Entry {
  source: string;
  blocks: StructuralBlock[];
}
const parser = new Marked({ extensions: [tableSourceTokenizer] });
const parseBlocks = (source: string) =>
  new Lexer(parser.defaults).blockTokens(source.replace(/\r\n?/g, '\n'));

/** Title ownership follows Markdown syntax, not a hash-prefix heuristic. */
export function startsWithNotebookTitle(source: string): boolean {
  const first = parseBlocks(source).find(token => token.type !== 'space');
  return first?.type === 'heading' && first.depth === 1;
}

/** Retains only the current document's source references and compact heading/content summaries. */
export class MarkdownStructureIndex {
  private entries = new Map<string, Entry>();

  hasSameStructure(previous: readonly SourceCell[], next: readonly SourceCell[]): boolean {
    if (previous.length !== next.length || previous.some((cell, i) =>
      cell.id !== next[i].id || cell.type !== next[i].type)) return false;
    if (previous.every((cell, i) => cell.type !== 'markdown' || cell.content === next[i].content)) return true;
    const before = this.project(previous);
    const after = this.project(next);
    return before.every((blocks, i) => blocks === after[i] || (
      blocks.length === after[i].length && blocks.every((block, j) => {
        const other = after[i][j];
        return block.type === other.type && (block.type !== 'heading' || (
          other.type === 'heading' && block.depth === other.depth && block.text === other.text
        ));
      })
    ));
  }

  project(cells: readonly SourceCell[]): readonly StructuralBlock[][] {
    const next = new Map<string, Entry>();
    const result = cells.map((cell) => {
      if (cell.type !== 'markdown') return [];
      let entry = this.entries.get(cell.id);
      if (!entry || entry.source !== cell.content) {
        const blocks: StructuralBlock[] = [];
        const tokens = parseBlocks(cell.content);
        for (const token of tokens) {
          if (token.type === 'heading' && token.depth <= 3) {
            blocks.push({ type: 'heading', depth: token.depth, text: token.text });
          } else if (token.type !== 'space' && blocks[blocks.length - 1]?.type !== 'content') {
            blocks.push({ type: 'content' });
          }
        }
        entry = { source: cell.content, blocks };
      }
      next.set(cell.id, entry);
      return entry.blocks;
    });
    this.entries = next;
    return result;
  }
}
