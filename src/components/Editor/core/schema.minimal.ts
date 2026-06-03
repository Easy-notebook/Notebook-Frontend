/**
 * Minimal ProseMirror schema for the NotebookEditorCore scaffold (Phase 1).
 *
 * This is intentionally tiny — `notebook > (markdownBlock | rawBlock)+` — just
 * enough to exercise the core plumbing (dispatch interceptor, change
 * classification, external-sync echo guard) in isolation, off the live editor
 * path. The full 9-node schema (codeCell / outputBlock / table / imageBlock /
 * thinkingBlock / image …) lands in Phase 2 (see docs/migration/01-prosemirror-schema.md).
 *
 * Framework-free: imports `prosemirror-model` only. No React, no Zustand.
 */
import { Schema } from 'prosemirror-model';

export const minimalSchema = new Schema({
  topNode: 'notebook',
  nodes: {
    /** Top node — the notebook document is an ordered list of cells. */
    notebook: {
      content: '(markdownBlock | rawBlock)+',
    },

    /** A markdown cell. Content is inline text for the scaffold. */
    markdownBlock: {
      group: 'cell',
      content: 'inline*',
      attrs: { cellId: { default: null } },
      parseDOM: [
        {
          tag: 'div[data-cell="markdown"]',
          getAttrs: (dom) => ({ cellId: (dom as HTMLElement).getAttribute('data-cell-id') }),
        },
      ],
      toDOM: (node) => [
        'div',
        { 'data-cell': 'markdown', 'data-cell-id': node.attrs.cellId ?? '' },
        0,
      ],
    },

    /** A raw (verbatim) cell. Code-like, no inline marks. */
    rawBlock: {
      group: 'cell',
      content: 'text*',
      code: true,
      defining: true,
      attrs: { cellId: { default: null } },
      parseDOM: [{ tag: 'pre[data-cell="raw"]', preserveWhitespace: 'full' }],
      toDOM: (node) => ['pre', { 'data-cell': 'raw', 'data-cell-id': node.attrs.cellId ?? '' }, 0],
    },

    text: { group: 'inline' },
  },
});
