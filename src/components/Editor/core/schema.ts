/**
 * Full ProseMirror schema for the notebook core (Phase 2).
 *
 * Implements docs/migration/01-prosemirror-schema.md. The PM document is the
 * single source of truth: cells are real nodes, editable text is real PM
 * content, opaque payloads (outputs, image/generation params, thinking state)
 * are structured attrs. Framework-free: `prosemirror-model` / `prosemirror-tables`
 * only. No React, no Zustand, no i18n, no `window`.
 *
 * Node tree:
 *   notebook (top)
 *   ├─ titleBlock                       (exactly one, first)
 *   └─ notebookCell+                    (wrapper carrying cellId/phaseId/…)
 *      └─ one cellBody node:
 *           markdownBlock  (block+ rich text)
 *         | codeCell       (codeText outputBlock?)
 *         | imageBlock     (atom)
 *         | thinkingBlock  (atom; durable streamed state)
 *         | rawBlock       (verbatim text)
 *         | table          (prosemirror-tables family)
 */
import { Schema, NodeSpec, MarkSpec, DOMOutputSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

const safeParse = (raw: string | null): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// --- table family (official prosemirror-tables) ---------------------------
const tables = tableNodes({
  tableGroup: 'cellBody',
  cellContent: 'block+',
  cellAttributes: {
    // alignment travels per-cell for GFM round-trip via remark-gfm
    align: {
      default: null,
      getFromDOM: (dom) => (dom as HTMLElement).style.textAlign || null,
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = `${attrs.style || ''}text-align: ${value};`;
      },
    },
  },
});

const nodes: Record<string, NodeSpec> = {
  // --- document structure -------------------------------------------------
  notebook: {
    content: 'titleBlock notebookCell+',
    attrs: {
      notebookId: { default: null },
      schemaVersion: { default: 2 },
      meta: { default: {} }, // frontmatter sink
    },
    toDOM: () => ['div', { class: 'nb-notebook' }, 0] as DOMOutputSpec,
  },

  titleBlock: {
    content: 'inline*',
    marks: '',
    defining: true,
    attrs: {
      cellId: { default: null },
      isDefault: { default: false },
      icon: { default: null },
      cover: { default: null },
    },
    toDOM: (n) =>
      [
        'h1',
        {
          'data-type': 'title',
          'data-cell-id': n.attrs.cellId ?? '',
          'data-default': n.attrs.isDefault ? '1' : null,
        },
        0,
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'h1[data-type=title]',
        getAttrs: (dom) => ({
          cellId: (dom as HTMLElement).getAttribute('data-cell-id'),
          isDefault: (dom as HTMLElement).getAttribute('data-default') === '1',
        }),
      },
    ],
  },

  notebookCell: {
    content: 'markdownBlock | codeCell | imageBlock | thinkingBlock | rawBlock | table',
    attrs: {
      cellId: { default: null },
      phaseId: { default: null },
      enableEdit: { default: true },
      collapsed: { default: false },
      description: { default: null },
      metadata: { default: {} },
    },
    selectable: false,
    draggable: true,
    toDOM: (n) =>
      [
        'div',
        {
          class: 'nb-cell',
          'data-cell-id': n.attrs.cellId ?? '',
          'data-phase-id': n.attrs.phaseId ?? '',
          'data-enable-edit': n.attrs.enableEdit ? '1' : '0',
        },
        0,
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'div.nb-cell',
        getAttrs: (dom) => ({
          cellId: (dom as HTMLElement).getAttribute('data-cell-id'),
          enableEdit: (dom as HTMLElement).getAttribute('data-enable-edit') !== '0',
        }),
      },
    ],
  },

  // --- cell bodies --------------------------------------------------------
  markdownBlock: {
    content: 'block+',
    group: 'cellBody',
    marks: '_',
    toDOM: () => ['div', { class: 'nb-md', 'data-type': 'markdown' }, 0] as DOMOutputSpec,
    parseDOM: [{ tag: 'div[data-type=markdown]' }],
  },

  codeCell: {
    content: 'codeText outputBlock?',
    group: 'cellBody',
    isolating: true,
    attrs: {
      language: { default: 'python' },
      executionCount: { default: null },
      displayMode: { default: 'complete' }, // 'complete' | 'codeOnly' | 'outputOnly'
      lastExecutedAt: { default: null },
      generating: { default: false },
    },
    toDOM: (n) =>
      [
        'div',
        {
          class: 'nb-code',
          'data-type': 'code',
          'data-language': n.attrs.language,
          'data-display-mode': n.attrs.displayMode,
        },
        0,
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'div[data-type=code]',
        getAttrs: (dom) => ({
          language: (dom as HTMLElement).getAttribute('data-language') || 'python',
          displayMode: (dom as HTMLElement).getAttribute('data-display-mode') || 'complete',
        }),
      },
    ],
  },

  codeText: {
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    toDOM: () => ['pre', { class: 'nb-code-src' }, ['code', 0]] as DOMOutputSpec,
    parseDOM: [{ tag: 'pre.nb-code-src', preserveWhitespace: 'full' }],
  },

  outputBlock: {
    atom: true,
    selectable: false,
    isolating: true,
    attrs: {
      status: { default: 'empty' }, // 'ok' | 'error' | 'empty'
      items: { default: [] }, // [{ kind, data, mime?, key }]
      executionCount: { default: null },
    },
    toDOM: (n) =>
      [
        'div',
        {
          class: 'nb-output',
          'data-type': 'output',
          'data-status': n.attrs.status,
          'data-items': JSON.stringify(n.attrs.items ?? []),
          contenteditable: 'false',
        },
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'div[data-type=output]',
        getAttrs: (dom) => ({
          status: (dom as HTMLElement).getAttribute('data-status') || 'empty',
          items: safeParse((dom as HTMLElement).getAttribute('data-items')) ?? [],
        }),
      },
    ],
  },

  imageBlock: {
    atom: true,
    group: 'cellBody',
    draggable: true,
    attrs: {
      src: { default: null },
      alt: { default: '' },
      title: { default: null },
      width: { default: null },
      source: { default: 'upload' }, // 'upload' | 'generated'
      generationParams: { default: null },
      isGenerating: { default: false },
    },
    toDOM: (n) =>
      [
        'div',
        { class: 'nb-image', 'data-type': 'image', 'data-source': n.attrs.source },
        [
          'img',
          { src: n.attrs.src ?? '', alt: n.attrs.alt ?? '', width: n.attrs.width ?? undefined },
        ],
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'div[data-type=image]',
        getAttrs: (dom) => {
          const img = (dom as HTMLElement).querySelector('img');
          return {
            src: img?.getAttribute('src') ?? null,
            alt: img?.getAttribute('alt') || '',
            source: (dom as HTMLElement).getAttribute('data-source') || 'upload',
          };
        },
      },
    ],
  },

  thinkingBlock: {
    atom: true,
    group: 'cellBody',
    selectable: true,
    attrs: {
      cellId: { default: null },
      agentName: { default: null },
      phase: { default: 'thinking' }, // 'thinking' | 'streaming' | 'done'
      text: { default: '' },
      textArray: { default: [] },
    },
    toDOM: (n) =>
      [
        'div',
        {
          class: 'nb-thinking',
          'data-type': 'thinking',
          'data-agent': n.attrs.agentName ?? '',
          'data-phase': n.attrs.phase,
        },
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'div[data-type=thinking]',
        getAttrs: (dom) => ({
          agentName: (dom as HTMLElement).getAttribute('data-agent') || null,
          phase: (dom as HTMLElement).getAttribute('data-phase') || 'thinking',
        }),
      },
    ],
  },

  rawBlock: {
    content: 'text*',
    marks: '',
    code: true,
    group: 'cellBody',
    defining: true,
    attrs: { format: { default: 'markdown' } }, // 'markdown' | 'html' | 'text'
    toDOM: (n) =>
      [
        'div',
        { class: 'nb-raw', 'data-type': 'raw', 'data-format': n.attrs.format },
        ['pre', 0],
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'div[data-type=raw]',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({
          format: (dom as HTMLElement).getAttribute('data-format') || 'markdown',
        }),
      },
    ],
  },

  // --- block flow inside markdownBlock ------------------------------------
  paragraph: {
    content: 'inline*',
    group: 'block',
    toDOM: () => ['p', 0] as DOMOutputSpec,
    parseDOM: [{ tag: 'p' }],
  },

  heading: {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: { level: { default: 1 }, id: { default: null } },
    toDOM: (n) => [`h${n.attrs.level}`, n.attrs.id ? { id: n.attrs.id } : {}, 0] as DOMOutputSpec,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (dom: HTMLElement | string) => ({
        level,
        id: typeof dom === 'string' ? null : dom.getAttribute('id'),
      }),
    })),
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    toDOM: () => ['blockquote', 0] as DOMOutputSpec,
    parseDOM: [{ tag: 'blockquote' }],
  },

  codeBlock: {
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    group: 'block',
    attrs: { language: { default: '' } },
    toDOM: (n) =>
      ['pre', { 'data-language': n.attrs.language || null }, ['code', 0]] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({ language: (dom as HTMLElement).getAttribute('data-language') || '' }),
      },
    ],
  },

  horizontalRule: {
    group: 'block',
    toDOM: () => ['hr'] as DOMOutputSpec,
    parseDOM: [{ tag: 'hr' }],
  },

  mathDisplay: {
    content: 'text*',
    marks: '',
    code: true,
    group: 'block',
    defining: true,
    toDOM: () =>
      ['div', { class: 'nb-math-display', 'data-type': 'math-display' }, 0] as DOMOutputSpec,
    parseDOM: [{ tag: 'div[data-type=math-display]', preserveWhitespace: 'full' }],
  },

  bulletList: {
    content: 'listItem+',
    group: 'block',
    toDOM: () => ['ul', 0] as DOMOutputSpec,
    parseDOM: [{ tag: 'ul' }],
  },

  orderedList: {
    content: 'listItem+',
    group: 'block',
    attrs: { start: { default: 1 } },
    toDOM: (n) => ['ol', n.attrs.start !== 1 ? { start: n.attrs.start } : {}, 0] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({
          start: +((dom as HTMLElement).getAttribute('start') || 1) || 1,
        }),
      },
    ],
  },

  listItem: {
    content: 'paragraph block*',
    defining: true,
    attrs: { checked: { default: null } }, // null | boolean (GFM task list)
    toDOM: (n) =>
      [
        'li',
        n.attrs.checked != null ? { 'data-checked': n.attrs.checked ? '1' : '0' } : {},
        0,
      ] as DOMOutputSpec,
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => {
          const c = (dom as HTMLElement).getAttribute('data-checked');
          return { checked: c == null ? null : c === '1' };
        },
      },
    ],
  },

  // --- inline -------------------------------------------------------------
  text: { group: 'inline' },

  mathInline: {
    content: 'text*',
    marks: '',
    code: true,
    inline: true,
    group: 'inline',
    toDOM: () =>
      ['span', { class: 'nb-math-inline', 'data-type': 'math-inline' }, 0] as DOMOutputSpec,
    parseDOM: [{ tag: 'span[data-type=math-inline]' }],
  },

  hardBreak: {
    inline: true,
    group: 'inline',
    selectable: false,
    toDOM: () => ['br'] as DOMOutputSpec,
    parseDOM: [{ tag: 'br' }],
  },

  // --- tables (prosemirror-tables) ----------------------------------------
  ...tables,
};

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }],
    toDOM: () => ['strong', 0] as DOMOutputSpec,
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0] as DOMOutputSpec,
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0] as DOMOutputSpec,
    excludes: '_',
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }],
    toDOM: () => ['s', 0] as DOMOutputSpec,
  },
  link: {
    attrs: { href: {}, title: { default: null }, kind: { default: 'url' } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = (dom as HTMLElement).getAttribute('href') || '';
          const kind = href.startsWith('file://')
            ? 'file'
            : (dom as HTMLElement).dataset.wikilink
              ? 'wiki'
              : 'url';
          return { href, kind };
        },
      },
    ],
    toDOM: (m) =>
      [
        'a',
        { href: m.attrs.href, 'data-wikilink': m.attrs.kind === 'wiki' ? '1' : null },
        0,
      ] as DOMOutputSpec,
  },
};

export const notebookSchema = new Schema({ topNode: 'notebook', nodes, marks });

/** Node-type-name constants — the single source for command/serializer string literals. */
export const NODE = {
  notebook: 'notebook',
  titleBlock: 'titleBlock',
  notebookCell: 'notebookCell',
  markdownBlock: 'markdownBlock',
  codeCell: 'codeCell',
  codeText: 'codeText',
  outputBlock: 'outputBlock',
  imageBlock: 'imageBlock',
  thinkingBlock: 'thinkingBlock',
  rawBlock: 'rawBlock',
  paragraph: 'paragraph',
  heading: 'heading',
  blockquote: 'blockquote',
  codeBlock: 'codeBlock',
  horizontalRule: 'horizontalRule',
  mathDisplay: 'mathDisplay',
  mathInline: 'mathInline',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
  listItem: 'listItem',
  hardBreak: 'hardBreak',
  text: 'text',
  table: 'table',
  tableRow: 'table_row',
  tableCell: 'table_cell',
  tableHeader: 'table_header',
} as const;
