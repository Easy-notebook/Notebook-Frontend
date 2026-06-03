/**
 * NotebookSerializer (Phase 2) — the ONLY module that knows Markdown.
 *
 * A real AST round-trip: `markdown ⇄ mdast (remark) ⇄ PM doc`. Replaces the
 * four overlapping regex/DOM conversion paths in the legacy editor
 * (`markdownConverters`, `cellConverters`, `parseMarkdownContent`,
 * `extractTextFromNode`). Framework-free: prosemirror-model + remark/mdast only.
 *
 * Cell-splitting rule (docs/migration/03 §5.2): walk the mdast root children;
 * each top-level node becomes one `notebookCell`. The first depth-1 heading
 * becomes the `titleBlock`; if absent, a default empty title is synthesised.
 *
 * Coverage in this phase: title, headings, paragraphs (with strong/em/
 * strike/code/link marks), bullet/ordered/task lists, blockquote, fenced code
 * (→ codeCell), nested code (→ codeBlock), block + inline math, thematic break,
 * and GFM tables with column alignment. Custom directive blocks (thinking/raw/
 * image/attachment) and legacy `Cell[]` interop are layered on next, gated on
 * real-notebook fixtures.
 */
import { unified, Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import remarkDirective from 'remark-directive';
import { Node as PMNode, Mark } from 'prosemirror-model';
import { notebookSchema as schema, NODE } from './schema';
import { CellLike } from './ports';

// mdast is loosely typed here to avoid a hard dep on @types/mdast in core.
/* eslint-disable @typescript-eslint/no-explicit-any */
type MdNode = any;

const s = schema;

function buildParser(): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ['yaml']) as unknown as Processor;
}

function buildStringifier(): Processor {
  return unified()
    .use(remarkStringify, { bullet: '-', fences: true, rule: '-', listItemIndent: 'one' })
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ['yaml']) as unknown as Processor;
}

const parser = buildParser();
const stringifier = buildStringifier();

// ===========================================================================
// mdast  ->  PM
// ===========================================================================

const MARK_BY_TYPE: Record<string, string> = {
  strong: 'strong',
  emphasis: 'em',
  delete: 'strike',
};

/** Convert mdast phrasing content to PM inline nodes, carrying active marks. */
function inlineToPM(children: MdNode[] = [], marks: readonly Mark[] = []): PMNode[] {
  const out: PMNode[] = [];
  for (const child of children) {
    switch (child.type) {
      case 'text':
        if (child.value) out.push(s.text(child.value, marks as Mark[]));
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
        out.push(...inlineToPM(child.children, marks.concat(s.mark(MARK_BY_TYPE[child.type]))));
        break;
      case 'inlineCode':
        out.push(s.text(child.value, marks.concat(s.mark('code'))));
        break;
      case 'link': {
        const kind = child.url?.startsWith('file://')
          ? 'file'
          : child.url?.startsWith('wiki:')
            ? 'wiki'
            : 'url';
        const linkMark = s.mark('link', { href: child.url, title: child.title ?? null, kind });
        out.push(...inlineToPM(child.children, marks.concat(linkMark)));
        break;
      }
      case 'inlineMath':
        out.push(s.node(NODE.mathInline, null, child.value ? s.text(child.value) : undefined));
        break;
      case 'break':
        out.push(s.node(NODE.hardBreak));
        break;
      default:
        // Unknown inline (e.g. inline image) — best-effort plain text.
        if (child.value) out.push(s.text(String(child.value), marks as Mark[]));
        else if (child.children) out.push(...inlineToPM(child.children, marks));
    }
  }
  return out;
}

/** Convert one mdast block node to a PM block node (used inside markdownBlock). */
function blockToPM(node: MdNode): PMNode | null {
  switch (node.type) {
    case 'paragraph':
      return s.node(NODE.paragraph, null, inlineToPM(node.children));
    case 'heading':
      return s.node(NODE.heading, { level: node.depth }, inlineToPM(node.children));
    case 'blockquote':
      return s.node(
        NODE.blockquote,
        null,
        node.children.map(blockToPM).filter(Boolean) as PMNode[]
      );
    case 'thematicBreak':
      return s.node(NODE.horizontalRule);
    case 'math':
      return s.node(NODE.mathDisplay, null, node.value ? s.text(node.value) : undefined);
    case 'code':
      return s.node(
        NODE.codeBlock,
        { language: node.lang || '' },
        node.value ? s.text(node.value) : undefined
      );
    case 'list':
      return listToPM(node);
    default:
      return null;
  }
}

function listToPM(node: MdNode): PMNode {
  const items = (node.children || []).map((item: MdNode) => {
    const checked = typeof item.checked === 'boolean' ? item.checked : null;
    const content = (item.children || []).map(blockToPM).filter(Boolean) as PMNode[];
    // listItem must start with a paragraph; wrap loose content if needed.
    const safe = content.length ? content : [s.node(NODE.paragraph)];
    return s.node(NODE.listItem, { checked }, safe);
  });
  return node.ordered
    ? s.node(NODE.orderedList, { start: node.start ?? 1 }, items)
    : s.node(NODE.bulletList, null, items);
}

const ALIGN_MAP: Record<string, string> = { left: 'left', right: 'right', center: 'center' };

/** Convert an mdast GFM table to a PM `table` node, preserving column alignment. */
function tableToPM(node: MdNode): PMNode {
  const align: (string | null)[] = (node.align || []).map((a: string | null) =>
    a ? (ALIGN_MAP[a] ?? null) : null
  );
  const rows = (node.children || []).map((row: MdNode, rowIdx: number) => {
    const cellType = rowIdx === 0 ? NODE.tableHeader : NODE.tableCell;
    const cells = (row.children || []).map((cell: MdNode, colIdx: number) => {
      const para = s.node(NODE.paragraph, null, inlineToPM(cell.children));
      return s.node(cellType, { align: align[colIdx] ?? null }, para);
    });
    return s.node(NODE.tableRow, null, cells);
  });
  return s.node(NODE.table, null, rows);
}

/** Wrap a cell-body node in a notebookCell. */
function cell(body: PMNode, cellId: string | null = null): PMNode {
  return s.node(NODE.notebookCell, { cellId }, body);
}

/** Convert a `:::name{...}` container directive to its cell body (or null). */
function directiveToCell(node: MdNode): PMNode | null {
  const attrs = (node.attributes || {}) as Record<string, string>;
  const cellId = attrs.id || null;
  switch (node.name) {
    case 'thinking':
      return cell(
        s.node(NODE.thinkingBlock, {
          cellId,
          agentName: attrs.agent || null,
          phase: attrs.state || 'thinking',
          text: directiveText(node),
        }),
        cellId
      );
    case 'raw':
      return cell(
        s.node(
          NODE.rawBlock,
          { format: attrs.format || 'markdown' },
          directiveText(node) ? s.text(directiveText(node)) : undefined
        ),
        cellId
      );
    case 'image':
      return cell(
        s.node(NODE.imageBlock, {
          src: attrs.src || null,
          alt: attrs.alt || '',
          title: attrs.title || null,
          source: attrs.source || 'upload',
        }),
        cellId
      );
    default:
      return null;
  }
}

/** Flatten a directive's child text content (paragraphs joined by blank lines). */
function directiveText(node: MdNode): string {
  const parts: string[] = [];
  const walk = (n: MdNode) => {
    if (n.type === 'text' || n.type === 'inlineCode') parts.push(n.value);
    else (n.children || []).forEach(walk);
  };
  (node.children || []).forEach((child: MdNode) => {
    walk(child);
    parts.push('\n');
  });
  return parts.join('').trim();
}

/** Map a top-level mdast node to a notebookCell (or null to skip, e.g. yaml). */
function topLevelToCell(node: MdNode): PMNode | null {
  switch (node.type) {
    case 'yaml':
      return null; // consumed into notebook.meta
    case 'code':
      return cell(
        s.node(NODE.codeCell, { language: node.lang || 'python' }, [
          s.node(NODE.codeText, null, node.value ? s.text(node.value) : undefined),
        ])
      );
    case 'table':
      return cell(tableToPM(node));
    case 'containerDirective':
    case 'leafDirective':
      return directiveToCell(node);
    default: {
      const block = blockToPM(node);
      if (!block) return null;
      return cell(s.node(NODE.markdownBlock, null, block));
    }
  }
}

export function parseMarkdown(md: string): PMNode {
  const root = parser.parse(md) as MdNode;
  const children: MdNode[] = root.children || [];

  let meta: Record<string, unknown> = {};
  let title: PMNode | null = null;
  const cells: PMNode[] = [];

  for (const node of children) {
    if (node.type === 'yaml') {
      meta = { raw: node.value };
      continue;
    }
    if (!title && node.type === 'heading' && node.depth === 1) {
      title = s.node(NODE.titleBlock, { isDefault: false }, inlineToPM(node.children));
      continue;
    }
    const c = topLevelToCell(node);
    if (c) cells.push(c);
  }

  if (!title) title = s.node(NODE.titleBlock, { isDefault: true });
  // notebook requires at least one cell.
  if (cells.length === 0)
    cells.push(cell(s.node(NODE.markdownBlock, null, s.node(NODE.paragraph))));

  return s.node(NODE.notebook, { meta }, [title, ...cells]);
}

// ===========================================================================
// PM  ->  mdast
// ===========================================================================

const MARK_TO_MD: Record<string, string> = { strong: 'strong', em: 'emphasis', strike: 'delete' };

/** Convert PM inline nodes to mdast phrasing content. */
function inlineToMd(node: PMNode): MdNode[] {
  const out: MdNode[] = [];
  node.forEach((child) => {
    if (child.type.name === NODE.mathInline) {
      out.push({ type: 'inlineMath', value: child.textContent });
      return;
    }
    if (child.type.name === NODE.hardBreak) {
      out.push({ type: 'break' });
      return;
    }
    if (child.isText) {
      let md: MdNode = { type: 'text', value: child.text || '' };
      // Apply marks inside-out. code + link are structural; strong/em/delete wrap.
      const codeMark = child.marks.find((m) => m.type.name === 'code');
      if (codeMark) md = { type: 'inlineCode', value: child.text || '' };
      for (const mark of child.marks) {
        const wrap = MARK_TO_MD[mark.type.name];
        if (wrap) md = { type: wrap, children: [md] };
      }
      const link = child.marks.find((m) => m.type.name === 'link');
      if (link)
        md = {
          type: 'link',
          url: link.attrs.href,
          title: link.attrs.title ?? null,
          children: [md],
        };
      out.push(md);
    }
  });
  return out;
}

/** Convert a PM block node (inside markdownBlock) to an mdast node. */
function blockToMd(node: PMNode): MdNode | null {
  switch (node.type.name) {
    case NODE.paragraph:
      return { type: 'paragraph', children: inlineToMd(node) };
    case NODE.heading:
      return { type: 'heading', depth: node.attrs.level, children: inlineToMd(node) };
    case NODE.blockquote:
      return { type: 'blockquote', children: node.content.content.map(blockToMd).filter(Boolean) };
    case NODE.horizontalRule:
      return { type: 'thematicBreak' };
    case NODE.mathDisplay:
      return { type: 'math', value: node.textContent };
    case NODE.codeBlock:
      return { type: 'code', lang: node.attrs.language || null, value: node.textContent };
    case NODE.bulletList:
    case NODE.orderedList:
      return listToMd(node);
    default:
      return null;
  }
}

function listToMd(node: PMNode): MdNode {
  const ordered = node.type.name === NODE.orderedList;
  const items: MdNode[] = [];
  node.forEach((item) => {
    const checked = item.attrs.checked;
    items.push({
      type: 'listItem',
      checked: typeof checked === 'boolean' ? checked : null,
      spread: false,
      children: item.content.content.map(blockToMd).filter(Boolean),
    });
  });
  return {
    type: 'list',
    ordered,
    start: ordered ? node.attrs.start : null,
    spread: false,
    children: items,
  };
}

const ALIGN_TO_MD: Record<string, string> = { left: 'left', right: 'right', center: 'center' };

function tableToMd(node: PMNode): MdNode {
  const rows: MdNode[] = [];
  let align: (string | null)[] = [];
  node.forEach((row, _o, rowIdx) => {
    const cells: MdNode[] = [];
    if (rowIdx === 0) align = [];
    row.forEach((cell, _co, colIdx) => {
      if (rowIdx === 0)
        align[colIdx] = cell.attrs.align ? (ALIGN_TO_MD[cell.attrs.align] ?? null) : null;
      // a table cell holds a single paragraph
      const para = cell.firstChild;
      cells.push({ type: 'tableCell', children: para ? inlineToMd(para) : [] });
    });
    rows.push({ type: 'tableRow', children: cells });
  });
  return { type: 'table', align, children: rows };
}

/** Map one notebookCell to top-level mdast node(s). */
function cellToMd(cellNode: PMNode): MdNode[] {
  const body = cellNode.firstChild;
  if (!body) return [];
  switch (body.type.name) {
    case NODE.markdownBlock: {
      const out: MdNode[] = [];
      body.forEach((block) => {
        const md = blockToMd(block);
        if (md) out.push(md);
      });
      return out;
    }
    case NODE.codeCell: {
      const codeText = body.firstChild; // codeText
      return [
        { type: 'code', lang: body.attrs.language || null, value: codeText?.textContent ?? '' },
      ];
    }
    case NODE.table:
      return [tableToMd(body)];
    case NODE.thinkingBlock: {
      const attributes: Record<string, string> = {};
      if (body.attrs.agentName) attributes.agent = body.attrs.agentName;
      if (body.attrs.phase) attributes.state = body.attrs.phase;
      if (cellNode.attrs.cellId) attributes.id = cellNode.attrs.cellId;
      return [
        {
          type: 'containerDirective',
          name: 'thinking',
          attributes,
          children: [
            { type: 'paragraph', children: [{ type: 'text', value: body.attrs.text || '' }] },
          ],
        },
      ];
    }
    case NODE.rawBlock: {
      const attributes: Record<string, string> = { format: body.attrs.format || 'markdown' };
      if (cellNode.attrs.cellId) attributes.id = cellNode.attrs.cellId;
      return [
        {
          type: 'containerDirective',
          name: 'raw',
          attributes,
          children: [{ type: 'paragraph', children: [{ type: 'text', value: body.textContent }] }],
        },
      ];
    }
    case NODE.imageBlock: {
      const attributes: Record<string, string> = {};
      if (body.attrs.src) attributes.src = body.attrs.src;
      if (body.attrs.alt) attributes.alt = body.attrs.alt;
      if (body.attrs.title) attributes.title = body.attrs.title;
      if (body.attrs.source) attributes.source = body.attrs.source;
      if (cellNode.attrs.cellId) attributes.id = cellNode.attrs.cellId;
      return [{ type: 'containerDirective', name: 'image', attributes, children: [] }];
    }
    default:
      return [];
  }
}

export function serializeMarkdown(doc: PMNode): string {
  const children: MdNode[] = [];

  const meta = doc.attrs.meta as { raw?: string } | undefined;
  if (meta?.raw) children.push({ type: 'yaml', value: meta.raw });

  doc.forEach((node) => {
    if (node.type.name === NODE.titleBlock) {
      if (!node.attrs.isDefault && node.textContent.trim()) {
        children.push({ type: 'heading', depth: 1, children: inlineToMd(node) });
      }
      return;
    }
    if (node.type.name === NODE.notebookCell) {
      children.push(...cellToMd(node));
    }
  });

  const root: MdNode = { type: 'root', children };
  return stringifier.stringify(root) as string;
}

// ===========================================================================
// Legacy Cell[] <-> PM doc interop (back-compat reader for IndexedDB snapshots)
// ===========================================================================

/** Parse a markdown *fragment* (a legacy cell's `content`) into PM block nodes. */
function parseBlocks(md: string): PMNode[] {
  const root = parser.parse(md || '') as MdNode;
  const out: PMNode[] = [];
  for (const node of root.children || []) {
    if (node.type === 'yaml') continue;
    const b = blockToPM(node);
    if (b) out.push(b);
    // Tables/directives inside a legacy markdown cell are rare; they are not
    // representable inside a single markdownBlock and are dropped here. Real
    // table/thinking/etc. cells come through as their own typed cells.
  }
  if (out.length === 0) out.push(s.node(NODE.paragraph));
  return out;
}

/** Serialize a markdownBlock's block children back to a markdown string. */
function blocksToMarkdown(markdownBlock: PMNode): string {
  const children: MdNode[] = [];
  markdownBlock.forEach((b) => {
    const md = blockToMd(b);
    if (md) children.push(md);
  });
  const root: MdNode = { type: 'root', children };
  return (stringifier.stringify(root) as string).replace(/\n+$/, '');
}

type ExecStatus = 'ok' | 'error' | 'empty';

/** Legacy `outputs` (string[] with sentinels) -> structured outputBlock items. */
function legacyOutputsToItems(outputs?: unknown[]): {
  status: ExecStatus;
  items: { kind: string; data: string; key: string }[];
} {
  const arr = (outputs as unknown[]) || [];
  if (arr.length === 0 || arr[0] === '[without-output]') return { status: 'empty', items: [] };
  let status: ExecStatus = 'ok';
  let data = arr;
  if (arr[0] === '[error-message-for-debug]') {
    status = 'error';
    data = arr.slice(1);
  }
  const items = data.map((o, i) => ({
    kind: status === 'error' ? 'error' : 'text',
    data: typeof o === 'string' ? o : JSON.stringify(o),
    key: `o${i}`,
  }));
  return { status, items };
}

/** Inverse: structured outputBlock items -> legacy `outputs` string[] with sentinels. */
function itemsToLegacyOutputs(outputBlock: PMNode | null): string[] {
  if (!outputBlock) return [];
  const status = outputBlock.attrs.status as ExecStatus;
  const items = (outputBlock.attrs.items as { data: string }[]) || [];
  if (status === 'empty') return [];
  const datas = items.map((it) => it.data);
  return status === 'error' ? ['[error-message-for-debug]', ...datas] : datas;
}

/** Wrap a body node in a notebookCell carrying the legacy cell's identity. */
function legacyCellWrap(c: CellLike, body: PMNode): PMNode {
  return s.node(
    NODE.notebookCell,
    {
      cellId: c.id ?? null,
      phaseId: (c.phaseId as string) ?? null,
      enableEdit: c.enableEdit !== false,
      description: (c.description as string) ?? null,
    },
    body
  );
}

/**
 * Convert a legacy `Cell[]` to a PM `notebook` doc. A synthetic default
 * `titleBlock` is prepended so the schema's title-first invariant holds; every
 * legacy cell is preserved 1:1 as a `notebookCell` (so `docToCells` is lossless
 * for id/type/outputs/phaseId/enableEdit/description).
 */
export function cellsToDoc(cells: CellLike[], opts: { notebookId?: string } = {}): PMNode {
  const out: PMNode[] = [];
  for (const c of cells) {
    switch (c.type) {
      case 'code': {
        const { status, items } = legacyOutputsToItems(c.outputs);
        const lang = (c.metadata?.language as string) || 'python';
        const codeChildren: PMNode[] = [
          s.node(NODE.codeText, null, c.content ? s.text(c.content) : undefined),
        ];
        if (items.length || status !== 'empty') {
          codeChildren.push(s.node(NODE.outputBlock, { status, items }));
        }
        out.push(legacyCellWrap(c, s.node(NODE.codeCell, { language: lang }, codeChildren)));
        break;
      }
      case 'raw':
        out.push(
          legacyCellWrap(c, s.node(NODE.rawBlock, null, c.content ? s.text(c.content) : undefined))
        );
        break;
      case 'image':
        out.push(legacyCellWrap(c, s.node(NODE.imageBlock, { src: c.content ?? null })));
        break;
      case 'thinking':
        out.push(legacyCellWrap(c, s.node(NODE.thinkingBlock, { text: c.content ?? '' })));
        break;
      case 'markdown':
      default:
        out.push(legacyCellWrap(c, s.node(NODE.markdownBlock, null, parseBlocks(c.content ?? ''))));
    }
  }
  if (out.length === 0) {
    out.push(
      s.node(NODE.notebookCell, null, s.node(NODE.markdownBlock, null, s.node(NODE.paragraph)))
    );
  }
  const title = s.node(NODE.titleBlock, { isDefault: true });
  return s.node(NODE.notebook, { notebookId: opts.notebookId ?? null }, [title, ...out]);
}

/** Convert a PM `notebook` doc back to a legacy `Cell[]` projection. */
export function docToCells(doc: PMNode): CellLike[] {
  const cells: CellLike[] = [];
  doc.forEach((node) => {
    if (node.type.name !== NODE.notebookCell) return;
    const body = node.firstChild;
    if (!body) return;
    const base = {
      id: (node.attrs.cellId as string) ?? '',
      enableEdit: node.attrs.enableEdit !== false,
      phaseId: (node.attrs.phaseId as string) ?? null,
      description: (node.attrs.description as string) ?? null,
    };
    switch (body.type.name) {
      case NODE.codeCell: {
        const outputBlock = body.childCount > 1 ? body.child(1) : null;
        cells.push({
          ...base,
          type: 'code',
          content: body.firstChild?.textContent ?? '',
          outputs: itemsToLegacyOutputs(outputBlock),
        });
        break;
      }
      case NODE.rawBlock:
        cells.push({ ...base, type: 'raw', content: body.textContent, outputs: [] });
        break;
      case NODE.imageBlock:
        cells.push({ ...base, type: 'image', content: body.attrs.src ?? '', outputs: [] });
        break;
      case NODE.thinkingBlock:
        cells.push({ ...base, type: 'thinking', content: body.attrs.text ?? '', outputs: [] });
        break;
      case NODE.markdownBlock:
      default:
        cells.push({ ...base, type: 'markdown', content: blocksToMarkdown(body), outputs: [] });
    }
  });
  return cells;
}

/** Back-compat reader for a persisted `{ notebook_id, cells, tasks }` snapshot. */
export function legacySnapshotToDoc(snapshot: { notebook_id?: string; cells: CellLike[] }): PMNode {
  return cellsToDoc(snapshot.cells || [], { notebookId: snapshot.notebook_id });
}

export const NotebookSerializer = {
  parseMarkdown,
  serializeMarkdown,
  cellsToDoc,
  docToCells,
  legacySnapshotToDoc,
};
