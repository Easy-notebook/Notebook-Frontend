/**
 * Typed OOP wrapper over one cell node in the PM doc (Phase 1 scaffold).
 *
 * Phase 1 only models the minimal schema (markdown / raw). The per-kind code /
 * image / thinking / output accessors and intent builders from
 * docs/migration/00-architecture-and-core-api.md §5.3 land alongside the full
 * schema in Phase 2/5. Framework-free: `prosemirror-model` only.
 */
import { Node as PMNode } from 'prosemirror-model';

export type CellKind = 'markdown' | 'code' | 'image' | 'thinking' | 'raw' | 'table';

const NODE_TYPE_TO_KIND: Record<string, CellKind> = {
  markdownBlock: 'markdown',
  rawBlock: 'raw',
  // extended in Phase 2: codeCell -> 'code', imageBlock -> 'image', …
};

export class NotebookCell {
  readonly node: PMNode;
  /** PM position of the node (start). */
  readonly pos: number;

  constructor(node: PMNode, pos: number) {
    this.node = node;
    this.pos = pos;
  }

  get id(): string | null {
    return (this.node.attrs.cellId as string | null) ?? null;
  }

  get kind(): CellKind {
    return NODE_TYPE_TO_KIND[this.node.type.name] ?? 'markdown';
  }

  /** Plain-text content of the cell (inline text). */
  get text(): string {
    return this.node.textContent;
  }
}
