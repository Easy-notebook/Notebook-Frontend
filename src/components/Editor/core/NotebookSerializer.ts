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
import { Node as PMNode, Mark } from 'prosemirror-model';
import { notebookSchema as schema, NODE } from './schema';

// mdast is loosely typed here to avoid a hard dep on @types/mdast in core.
/* eslint-disable @typescript-eslint/no-explicit-any */
type MdNode = any;

const s = schema;

function buildParser(): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkFrontmatter, ['yaml']) as unknown as Processor;
}

function buildStringifier(): Processor {
  return unified()
    .use(remarkStringify, { bullet: '-', fences: true, rule: '-', listItemIndent: 'one' })
    .use(remarkGfm)
    .use(remarkMath)
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
    // thinkingBlock / imageBlock / rawBlock -> remark-directive (next phase)
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

export const NotebookSerializer = {
  parseMarkdown,
  serializeMarkdown,
};
