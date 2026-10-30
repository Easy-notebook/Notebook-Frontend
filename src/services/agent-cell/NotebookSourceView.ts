import type { Cell } from '@Store/models';

/** Document coordinates count cells, never lines within a cell. */
export function cellSourceIndex(cell: Cell, index: number) {
  return {
    cellId: cell.id,
    lineNumber: index + 1,
    type: cell.type,
    language: cell.language,
    preview:
      cell.type === 'agent'
        ? '[Agent conversation]'
        : cell.content.replace(/\s+/g, ' ').slice(0, 400),
  };
}

/** Internal source coordinates reset at one for every cell; content remains lossless. */
export function cellSourceDetail(content: string) {
  const lines = content.split('\n').map((text, index) => ({ lineNumber: index + 1, text }));
  return { content, lineCount: lines.length, lines };
}
