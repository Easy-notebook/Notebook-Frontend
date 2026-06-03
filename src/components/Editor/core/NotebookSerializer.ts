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

/**
 * Stringify a list of mdast child nodes back to a verbatim markdown fragment.
 * Used to capture a directive body's *source* (with inline markers, blank lines
 * between paragraphs, and raw `html` nodes) rather than flattening it to text.
 */
function stringifyFragment(children: MdNode[] = []): string {
  if (!children.length) return '';
  const root: MdNode = { type: 'root', children };
  return (stringifier.stringify(root) as string).replace(/\n+$/, '');
}

/** Parse a markdown fragment into mdast block children (inverse of stringifyFragment). */
function parseFragment(md: string): MdNode[] {
  if (!md) return [];
  const root = parser.parse(md) as MdNode;
  return (root.children || []).filter((n: MdNode) => n.type !== 'yaml');
}

/**
 * True when `html` re-parses (at the top level) into a single block-level mdast
 * `html` node. Such HTML can be emitted as a verbatim top-level `html` node and
 * stays a fixed point; inline HTML (e.g. `<b>hi</b>`) would be re-read as prose
 * and must instead be wrapped in a `:::raw` directive.
 */
function isBlockHtml(html: string): boolean {
  const kids = (parser.parse(html) as MdNode).children || [];
  return kids.length === 1 && kids[0].type === 'html';
}

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
      case 'image':
        // Plain inline image (`![alt](src)`). Reserve imageBlock for the
        // `:::image` directive; a bare markdown image stays inline so the
        // round-trip is idempotent.
        out.push(
          s.node(NODE.inlineImage, {
            src: child.url ?? null,
            alt: child.alt ?? '',
            title: child.title ?? null,
          })
        );
        break;
      case 'break':
        out.push(s.node(NODE.hardBreak));
        break;
      default:
        // Unknown inline — best-effort plain text so nothing is silently lost.
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
    // Schema requires `listItem` to be `paragraph block*` — its first child MUST
    // be a paragraph. CommonMark, however, produces a listItem whose first child
    // is a nested `list` when an item begins with a sublist and has no own text
    // (e.g. `- - x`). Prepend an empty paragraph so such items stay valid
    // instead of throwing a RangeError.
    const safe =
      content.length === 0
        ? [s.node(NODE.paragraph)]
        : content[0].type.name === NODE.paragraph
          ? content
          : [s.node(NODE.paragraph), ...content];
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
function directiveToCell(node: MdNode, source: string): PMNode | null {
  const attrs = (node.attributes || {}) as Record<string, string>;
  const cellId = attrs.id || null;
  switch (node.name) {
    case 'thinking': {
      const text = directiveBodySource(node, source);
      return cell(
        s.node(NODE.thinkingBlock, {
          cellId,
          agentName: attrs.agent || null,
          phase: attrs.state || 'thinking',
          text,
        }),
        cellId
      );
    }
    case 'raw': {
      const format = attrs.format || 'markdown';
      // HTML raw bodies must be captured VERBATIM from source (re-stringifying
      // would escape inline tags like `<b>` to `\<b>`); markdown/text bodies are
      // re-stringified so they normalise and round-trip cleanly.
      const text = directiveBodySource(node, source, format === 'html');
      return cell(s.node(NODE.rawBlock, { format }, text ? s.text(text) : undefined), cellId);
    }
    case 'image':
      return cell(
        s.node(NODE.imageBlock, {
          src: attrs.src || null,
          alt: attrs.alt || '',
          title: attrs.title || null,
          source: attrs.source || 'generated',
          generationParams: attrs.gen ? safeParseJSON(attrs.gen) : null,
        }),
        cellId
      );
    default: {
      // Unknown directive — preserve its name, attributes AND body verbatim in a
      // rawBlock so it re-serializes as the identical `:::name{...}` directive
      // (docs/migration/03 §7.2 — never lose content/metadata).
      const text = directiveBodySource(node, source);
      return cell(
        s.node(
          NODE.rawBlock,
          {
            format: 'directive',
            directiveName: node.name,
            directiveAttrs: Object.keys(attrs).length ? { ...attrs } : {},
          },
          text ? s.text(text) : undefined
        ),
        cellId
      );
    }
  }
}

function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Capture a directive's body. With `verbatim` (HTML raw blocks), slice the
 * literal source span between the body's first and last child so inline tags
 * survive unescaped. Otherwise re-stringify the children to a normalised
 * markdown fragment — preserving inline markers (`**bold**`), the blank line
 * between paragraphs, and block `html` nodes.
 */
function directiveBodySource(node: MdNode, source: string, verbatim = false): string {
  const children: MdNode[] = node.children || [];
  if (!children.length) return '';
  if (verbatim) {
    const start = children[0]?.position?.start?.offset;
    const end = children[children.length - 1]?.position?.end?.offset;
    if (typeof start === 'number' && typeof end === 'number' && source) {
      return source.slice(start, end);
    }
  }
  return stringifyFragment(children);
}

/** Map a top-level mdast node to a notebookCell (or null to skip, e.g. yaml). */
function topLevelToCell(node: MdNode, source: string): PMNode | null {
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
    case 'html':
      // Top-level raw HTML (remark emits `html` nodes). Route to a verbatim
      // rawBlock instead of dropping it — the legacy codec's #1 defect.
      return cell(
        s.node(
          NODE.rawBlock,
          { format: 'html' },
          node.value ? s.text(String(node.value)) : undefined
        )
      );
    case 'containerDirective':
    case 'leafDirective':
    case 'textDirective':
      return directiveToCell(node, source);
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
    const c = topLevelToCell(node, md);
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
    if (child.type.name === NODE.inlineImage) {
      out.push({
        type: 'image',
        url: child.attrs.src ?? '',
        alt: child.attrs.alt ?? null,
        title: child.attrs.title ?? null,
      });
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
      // Re-parse the settled text so multi-paragraph / inline-marked bodies
      // survive (the blank line between paragraphs is preserved).
      const children = parseFragment(body.attrs.text || '');
      return [
        {
          type: 'containerDirective',
          name: 'thinking',
          attributes,
          children: children.length ? children : [{ type: 'paragraph', children: [] }],
        },
      ];
    }
    case NODE.rawBlock: {
      const text = body.textContent;
      if (body.attrs.format === 'html') {
        if (!text) return [];
        // Block-level HTML (e.g. `<div>…`, `<iframe>…`) round-trips as a verbatim
        // top-level `html` node. Inline HTML (e.g. `<b>hi</b>`) would re-parse as
        // prose (and get backslash-escaped), so wrap it in a `:::raw{format=html}`
        // directive carrying the HTML as a child `html` node — both forms are a
        // fixed point and preserve the markup verbatim (docs/migration/03 §7).
        if (isBlockHtml(text)) return [{ type: 'html', value: text }];
        const attributes: Record<string, string> = { format: 'html' };
        if (cellNode.attrs.cellId) attributes.id = cellNode.attrs.cellId;
        return [
          {
            type: 'containerDirective',
            name: 'raw',
            attributes,
            children: [{ type: 'html', value: text }],
          },
        ];
      }
      // A rawBlock standing in for an unknown directive re-emits that exact
      // directive (name + attributes + verbatim body).
      if (body.attrs.format === 'directive' && body.attrs.directiveName) {
        const dirAttrs = (body.attrs.directiveAttrs as Record<string, string>) || {};
        const attributes: Record<string, string> = { ...dirAttrs };
        if (cellNode.attrs.cellId && !attributes.id) attributes.id = cellNode.attrs.cellId;
        return [
          {
            type: 'containerDirective',
            name: body.attrs.directiveName as string,
            attributes,
            children: parseFragment(text),
          },
        ];
      }
      const attributes: Record<string, string> = { format: body.attrs.format || 'markdown' };
      if (cellNode.attrs.cellId) attributes.id = cellNode.attrs.cellId;
      return [
        {
          type: 'containerDirective',
          name: 'raw',
          attributes,
          children: parseFragment(text),
        },
      ];
    }
    case NODE.imageBlock: {
      const attributes: Record<string, string> = {};
      if (body.attrs.src) attributes.src = body.attrs.src;
      if (body.attrs.alt) attributes.alt = body.attrs.alt;
      if (body.attrs.title) attributes.title = body.attrs.title;
      if (body.attrs.source) attributes.source = body.attrs.source;
      if (body.attrs.generationParams != null)
        attributes.gen = JSON.stringify(body.attrs.generationParams);
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

/**
 * outputBlock item shape. `data` is the human-readable string projection;
 * `raw` carries the ORIGINAL `OutputItem` object verbatim when the legacy
 * output was an object (e.g. `{ type:'image', content:{ mime, data } }`), so the
 * structured payload survives the round-trip losslessly. `fromString` records
 * whether the original entry was a bare string vs an object, so `toCells` can
 * faithfully reconstruct the original `outputs` array (string[]/OutputItem[]).
 */
interface OutputItemNode {
  kind: string;
  data: string;
  key: string;
  fromString: boolean;
  raw?: unknown;
}

const isErrorOutput = (o: unknown): boolean =>
  !!o && typeof o === 'object' && (o as { type?: unknown }).type === 'error';

/** Legacy `outputs` (OutputItem[]/string[] hybrid, with sentinels) -> structured items. */
function legacyOutputsToItems(outputs?: unknown[]): {
  status: ExecStatus;
  items: OutputItemNode[];
} {
  const arr = (outputs as unknown[]) || [];
  if (arr.length === 0 || arr[0] === '[without-output]') return { status: 'empty', items: [] };
  let status: ExecStatus = 'ok';
  let data = arr;
  if (arr[0] === '[error-message-for-debug]') {
    status = 'error';
    data = arr.slice(1);
  } else if (arr.some(isErrorOutput)) {
    // An object OutputItem with type:'error' marks the cell as errored.
    status = 'error';
  }
  const items: OutputItemNode[] = data.map((o, i) => {
    const isString = typeof o === 'string';
    return {
      kind: isErrorOutput(o) || (status === 'error' && isString) ? 'error' : 'text',
      data: isString
        ? (o as string)
        : typeof (o as { content?: unknown })?.content === 'string'
          ? (o as { content: string }).content
          : JSON.stringify(o),
      key: `o${i}`,
      fromString: isString,
      ...(isString ? {} : { raw: o }),
    };
  });
  return { status, items };
}

/**
 * Inverse: structured outputBlock items -> legacy `outputs` array. Object
 * OutputItems are re-hydrated verbatim from `it.raw`; bare-string outputs come
 * back as strings (with the legacy `[error-message-for-debug]` sentinel only
 * when the errored cell's outputs were strings, preserving back-compat).
 */
function itemsToLegacyOutputs(outputBlock: PMNode | null): unknown[] {
  if (!outputBlock) return [];
  const status = outputBlock.attrs.status as ExecStatus;
  const items = (outputBlock.attrs.items as OutputItemNode[]) || [];
  if (status === 'empty') return [];
  const values = items.map((it) => ('raw' in it && !it.fromString ? it.raw : it.data));
  // Only the legacy string-output error path used the in-band sentinel; object
  // error outputs carry their own `type:'error'`, so no sentinel is prepended.
  const allFromString = items.every((it) => it.fromString !== false);
  return status === 'error' && allFromString ? ['[error-message-for-debug]', ...values] : values;
}

/**
 * Build the `notebookCell` wrapper attrs from a legacy cell. `metadata` is the
 * sink for keys that have no dedicated attr (so unknown keys round-trip), minus
 * the ones promoted to first-class codeCell attrs.
 */
function cellWrapAttrs(c: CellLike): Record<string, unknown> {
  const metadata = c.metadata && typeof c.metadata === 'object' ? { ...c.metadata } : {};
  return {
    cellId: c.id ?? null,
    phaseId: (c.phaseId as string) ?? null,
    enableEdit: c.enableEdit !== false,
    description: (c.description as string) ?? null,
    metadata,
  };
}

/** Wrap a body node in a notebookCell carrying the legacy cell's identity. */
function legacyCellWrap(c: CellLike, body: PMNode): PMNode {
  return s.node(NODE.notebookCell, cellWrapAttrs(c), body);
}

/** Build a `codeCell` body (codeText + optional outputBlock) from a legacy cell. */
function legacyCodeBody(c: CellLike): PMNode {
  const { status, items } = legacyOutputsToItems(c.outputs);
  const md = (c.metadata as Record<string, unknown>) || {};
  const attrs: Record<string, unknown> = {
    language: (md.language as string) || 'python',
  };
  if (md.executionCount != null) attrs.executionCount = md.executionCount;
  if (md.displayMode != null) attrs.displayMode = md.displayMode;
  const codeChildren: PMNode[] = [
    s.node(NODE.codeText, null, c.content ? s.text(c.content) : undefined),
  ];
  if (items.length || status !== 'empty') {
    codeChildren.push(
      s.node(NODE.outputBlock, { status, items, executionCount: attrs.executionCount ?? null })
    );
  }
  return s.node(NODE.codeCell, attrs, codeChildren);
}

/** Parse a legacy `link` cell's `[label](href)` content into a linked paragraph. */
function linkBodyFromContent(content: string): PMNode {
  const blocks = parseBlocks(content || '');
  // parseBlocks yields a paragraph holding a link mark (remark parses `[l](h)`).
  return s.node(NODE.markdownBlock, null, blocks);
}

/**
 * Convert a legacy `Cell[]` to a PM `notebook` doc. A synthetic default
 * `titleBlock` is prepended so the schema's title-first invariant holds. Most
 * cells map 1:1; `hybrid` DECOMPOSES into an adjacent markdownBlock cell + a
 * codeCell cell (minting a second cellId) per docs/migration/01 §6.1.
 */
export function cellsToDoc(cells: CellLike[], opts: { notebookId?: string } = {}): PMNode {
  const out: PMNode[] = [];
  for (const c of cells) {
    switch (c.type) {
      case 'code':
        out.push(legacyCellWrap(c, legacyCodeBody(c)));
        break;
      case 'hybrid': {
        // Decompose: prose half -> markdownBlock cell, code half -> codeCell cell.
        const md = (c.metadata as Record<string, unknown>) || {};
        const prose = (md.markdown as string) ?? (md.prose as string) ?? '';
        if (prose) {
          out.push(legacyCellWrap(c, s.node(NODE.markdownBlock, null, parseBlocks(prose))));
        }
        out.push(
          s.node(
            NODE.notebookCell,
            { ...cellWrapAttrs(c), cellId: c.id ? `${c.id}-code` : null },
            legacyCodeBody(c)
          )
        );
        break;
      }
      case 'raw': {
        const md = (c.metadata as Record<string, unknown>) || {};
        const rawAttrs: Record<string, unknown> = { format: (md.format as string) || 'markdown' };
        if (md.directiveName) rawAttrs.directiveName = md.directiveName;
        if (md.directiveAttrs) rawAttrs.directiveAttrs = md.directiveAttrs;
        out.push(
          legacyCellWrap(
            c,
            s.node(NODE.rawBlock, rawAttrs, c.content ? s.text(c.content) : undefined)
          )
        );
        break;
      }
      case 'image':
        out.push(
          legacyCellWrap(
            c,
            s.node(NODE.imageBlock, {
              src: c.content ?? null,
              generationParams: (c.metadata as Record<string, unknown>)?.generationParams ?? null,
            })
          )
        );
        break;
      case 'thinking': {
        const md = (c.metadata as Record<string, unknown>) || {};
        out.push(
          legacyCellWrap(
            c,
            s.node(NODE.thinkingBlock, {
              cellId: c.id ?? null,
              text: c.content ?? '',
              agentName: (md.agentName as string) ?? (c.agentName as string) ?? null,
              phase: (md.phase as string) ?? 'thinking',
              textArray: (md.textArray as unknown[]) ?? (c.textArray as unknown[]) ?? [],
            })
          )
        );
        break;
      }
      case 'link':
        out.push(legacyCellWrap(c, linkBodyFromContent(c.content ?? '')));
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

/** Restore the legacy `metadata` bag from a notebookCell, re-merging code attrs. */
function restoreMetadata(
  node: PMNode,
  extra: Record<string, unknown> = {}
): Record<string, unknown> | null {
  const stored = (node.attrs.metadata as Record<string, unknown>) || {};
  const merged = { ...stored, ...extra };
  return Object.keys(merged).length ? merged : null;
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
        const extra: Record<string, unknown> = {};
        if (body.attrs.language) extra.language = body.attrs.language;
        if (body.attrs.executionCount != null) extra.executionCount = body.attrs.executionCount;
        if (body.attrs.displayMode != null && body.attrs.displayMode !== 'complete')
          extra.displayMode = body.attrs.displayMode;
        cells.push({
          ...base,
          type: 'code',
          content: body.firstChild?.textContent ?? '',
          outputs: itemsToLegacyOutputs(outputBlock),
          metadata: restoreMetadata(node, extra),
        });
        break;
      }
      case NODE.rawBlock: {
        const rawExtra: Record<string, unknown> = {};
        // Only persist `format` when non-default so a plain markdown rawBlock's
        // metadata bag stays empty (keeps toCells->fromCells structurally eq).
        if (body.attrs.format && body.attrs.format !== 'markdown')
          rawExtra.format = body.attrs.format;
        if (body.attrs.directiveName) rawExtra.directiveName = body.attrs.directiveName;
        if (body.attrs.directiveAttrs) rawExtra.directiveAttrs = body.attrs.directiveAttrs;
        cells.push({
          ...base,
          type: 'raw',
          content: body.textContent,
          outputs: [],
          metadata: restoreMetadata(node, rawExtra),
        });
        break;
      }
      case NODE.imageBlock:
        cells.push({
          ...base,
          type: 'image',
          content: body.attrs.src ?? '',
          outputs: [],
          metadata: restoreMetadata(
            node,
            body.attrs.generationParams != null
              ? { generationParams: body.attrs.generationParams }
              : {}
          ),
        });
        break;
      case NODE.thinkingBlock:
        cells.push({
          ...base,
          type: 'thinking',
          content: body.attrs.text ?? '',
          outputs: [],
          metadata: restoreMetadata(node, {
            ...(body.attrs.agentName ? { agentName: body.attrs.agentName } : {}),
            ...(body.attrs.phase ? { phase: body.attrs.phase } : {}),
            ...(Array.isArray(body.attrs.textArray) && body.attrs.textArray.length
              ? { textArray: body.attrs.textArray }
              : {}),
          }),
        });
        break;
      case NODE.markdownBlock:
      default:
        cells.push({
          ...base,
          type: 'markdown',
          content: blocksToMarkdown(body),
          outputs: [],
          metadata: restoreMetadata(node),
        });
    }
  });
  return cells;
}

/** Alias: `fromCells` builds a PM doc from a legacy projection (docs §5.4). */
export const fromCells = cellsToDoc;
/** Alias: `toCells` projects a PM doc to the legacy `Cell[]` shape (docs §5.4). */
export const toCells = docToCells;

/** Back-compat reader for a persisted `{ notebook_id, cells, tasks }` snapshot. */
export function legacySnapshotToDoc(snapshot: {
  notebook_id?: string;
  cells?: CellLike[];
  tasks?: unknown;
}): PMNode {
  return cellsToDoc(snapshot.cells || [], { notebookId: snapshot.notebook_id });
}

// ===========================================================================
// Persistence codec: PM doc <-> PM JSON (lossless canonical on-disk format)
// ===========================================================================

export interface NotebookJSON {
  schemaVersion: number;
  doc: Record<string, unknown>;
}

/**
 * Serialize a PM doc to the canonical persistence JSON: the full PM-JSON tree
 * (which already carries outputs/cellId/displayMode as node attrs) wrapped with
 * the notebook's `schemaVersion` for forward migration.
 */
export function toJSON(doc: PMNode): NotebookJSON {
  return {
    schemaVersion: (doc.attrs.schemaVersion as number) ?? 2,
    doc: doc.toJSON() as Record<string, unknown>,
  };
}

/**
 * Rebuild a PM doc from persistence JSON. Accepts either the wrapped
 * `{ schemaVersion, doc }` shape or a bare PM-JSON doc object. Validated via
 * `Node.fromJSON(schema, …)`.
 */
export function fromJSON(json: NotebookJSON | Record<string, unknown>): PMNode {
  const raw =
    json && typeof json === 'object' && 'doc' in json && (json as NotebookJSON).doc
      ? (json as NotebookJSON).doc
      : json;
  return PMNode.fromJSON(schema, raw as Parameters<typeof PMNode.fromJSON>[1]);
}

export const NotebookSerializer = {
  parseMarkdown,
  serializeMarkdown,
  cellsToDoc,
  docToCells,
  fromCells,
  toCells,
  legacySnapshotToDoc,
  toJSON,
  fromJSON,
};
