import type { Cell } from '@Store/models';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { formatCodeFence, standaloneFence } from '@Utils/markdown/fencedMarkdown';

const inputText = (text: string) => text.replace(/\r\n?/g, '\n');

/** Editable text projection. Outputs and non-text metadata never enter the source buffer. */
export class NotebookSourceDocument {
  readonly source: string;
  private readonly token: string;
  private readonly bodies: string[];
  private readonly entries: Cell[];
  private readonly positions: Map<string, number>;

  constructor(private readonly cells: readonly Cell[]) {
    this.positions = new Map(cells.map((cell, index) => [cell.id, index]));
    if (this.positions.size !== cells.length) {
      throw new Error('Duplicate cell identities');
    }
    this.entries = [...cells];
    this.bodies = cells.map((cell) =>
      cell.type === 'code'
        ? formatCodeFence(inputText(cell.content), normalizeCodeLanguage(cell.language))
        : inputText(cell.content)
    );
    do {
      this.token = crypto.randomUUID();
    } while (this.bodies.some((body) => body.includes(`<!-- notebook:${this.token}:`)));
    this.source = this.bodies
      .map((body, index) => `${this.marker(index, 'start')}\n${body}\n${this.marker(index, 'end')}`)
      .join('\n\n');
  }

  private marker(index: number, edge: 'start' | 'end') {
    return `<!-- notebook:${this.token}:${index}:${edge} -->`;
  }

  appendCell(source: string, type: 'markdown' | 'code' | 'raw'): { source: string; cursor: number } {
    source = inputText(source);
    this.visitCells(source);
    let id: string;
    do {
      id = crypto.randomUUID();
    } while (this.positions.has(id));
    const cell: Cell = {
      id,
      type,
      content: '',
      outputs: [],
      ...(type === 'code' ? { language: 'python' } : {}),
    };
    const index = this.entries.length;
    const body = type === 'code' ? formatCodeFence('', 'python') : '';
    this.positions.set(id, index);
    this.entries.push(cell);
    this.bodies.push(body);
    const prefix = `${source ? `${source}\n\n` : ''}${this.marker(index, 'start')}\n`;
    return {
      source: `${prefix}${body}\n${this.marker(index, 'end')}`,
      cursor: prefix.length + (type === 'code' ? body.indexOf('\n') + 1 : 0),
    };
  }

  /** Three-way apply: preserve live outputs/metadata and reject conflicting text or structure. */
  reconcile(source: string, current: readonly Cell[]): Cell[] {
    source = inputText(source);
    if (source === this.source) return [...current];
    const draft = this.decode(source);
    if (
      current.length !== this.cells.length ||
      current.some((cell, index) => cell.id !== this.cells[index].id)
    ) {
      throw new Error('Document structure changed while source was open');
    }
    const retained = new Set(draft.map((cell) => cell.id));
    for (let index = 0; index < current.length; index++) {
      if (!retained.has(current[index].id) && current[index] !== this.cells[index]) {
        throw new Error(`Deleted cell changed while source was open: ${current[index].id}`);
      }
    }
    const sameText = (a: Cell, b: Cell) =>
      a.type === b.type &&
      a.content === b.content &&
      a.language === b.language &&
      a.metadata?.editorMode === b.metadata?.editorMode &&
      a.metadata?.sourceCellType === b.metadata?.sourceCellType;
    return draft.map((edited) => {
      const index = this.positions.get(edited.id);
      if (index === undefined || index >= this.cells.length) return edited;
      const base = this.cells[index];
      const live = current[index];
      if (sameText(edited, base)) return live;
      if (!sameText(live, base) && !sameText(live, edited)) {
        throw new Error(`Cell source changed concurrently: ${edited.id}`);
      }
      if (sameText(live, edited)) return live;
      return {
        ...live,
        type: edited.type,
        content: edited.content,
        language: edited.language,
        metadata: {
          ...live.metadata,
          editorMode: edited.metadata?.editorMode,
          sourceCellType: edited.metadata?.sourceCellType,
        },
      };
    });
  }

  /** Validates all boundaries before returning a new document; never mutates input cells. */
  decode(source: string): Cell[] {
    source = inputText(source);
    const result: Cell[] = [];
    this.visitCells(source, (index, body) => result.push(this.decodeCell(index, body)));
    return result;
  }

  /** Validation-only callers avoid body slicing and materializing decoded cells. */
  private visitCells(source: string, visit?: (index: number, body: string) => void): void {
    const markers = new RegExp(`^<!-- notebook:${this.token}:(\\d+):(start|end) -->$`, 'gm');
    const seen = new Set<number>();
    let cursor = 0;
    let open: { index: number; bodyStart: number } | undefined;
    for (const match of source.matchAll(markers)) {
      const position = match.index!;
      const index = Number(match[1]);
      if (!Number.isSafeInteger(index) || !this.entries[index])
        throw new Error('Unknown cell boundary');
      if (match[2] === 'start') {
        if (open || seen.has(index) || source.slice(cursor, position).trim())
          throw new Error('Invalid or duplicated cell boundary');
        const bodyStart = position + match[0].length + 1;
        if (source[bodyStart - 1] !== '\n') throw new Error('Missing cell boundary newline');
        open = { index, bodyStart };
      } else {
        if (
          !open ||
          open.index !== index ||
          position <= open.bodyStart ||
          source[position - 1] !== '\n'
        )
          throw new Error('Unmatched cell boundary');
        if (visit) visit(index, source.slice(open.bodyStart, position - 1));
        seen.add(index);
        open = undefined;
        cursor = position + match[0].length;
      }
    }
    if (open || source.slice(cursor).trim()) throw new Error('Incomplete cell boundaries');
  }

  private decodeCell(index: number, body: string): Cell {
    const cell = this.entries[index];
    if (body === this.bodies[index]) return cell;
    if (cell.type !== 'code') return { ...cell, content: body };
    const fence = standaloneFence(body);
    if (fence && fence.language !== 'mermaid') {
      return { ...cell, content: fence.code, language: normalizeCodeLanguage(fence.language) };
    }
    return {
      ...cell,
      type: 'markdown',
      content: body,
      metadata: {
        ...cell.metadata,
        editorMode: 'source',
        sourceCellType: cell.type,
      },
    };
  }
}
