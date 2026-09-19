/**
 * Cell conversion utilities for TiptapNotebookEditor
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Cell } from '@Store/models';
import { convertMarkdownToHtml } from './markdownConverters';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { formatCodeFence, replaceFencedCode, standaloneFence } from '@Utils/markdown/fencedMarkdown';
import { codeCellFromAttributes } from './codeCellAttributes';
import { parseSourceCellType } from './sourceCellAttributes';
import { encodeTableCode, escapeHtml } from './inlineMarkdown';
import { requiresHtmlTable, serializeHtmlTable, serializeTableBlock } from './tableSource';

// Debug flag - set to true only when debugging
const DEBUG = false;

/**
 * 生成唯一的cell ID
 */
export function generateCellId() {
  return `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 将cells数组转换为HTML内容
 */
export function convertCellsToHtml(cells: Cell[], includeDocumentFrame = true) {
  if (!cells || cells.length === 0) {
    if (!includeDocumentFrame) return '';
    // Schema requires 'title block+', so return default title and empty paragraph
    return `<div data-type="title" data-cell-id="${generateCellId()}"></div><p></p>`;
  }

  if (DEBUG) {
    console.log('=== convertCellsToHtml 转换 ===');
    console.log(
      '输入cells:',
      cells.map((c, i) => ({ index: i, id: c.id, type: c.type }))
    );
  }

  // 子标题ID唯一化计数器：baseId -> (slug -> count)
  const headingSlugCounter = new Map<string, Map<string, number>>();
  let titleGenerated = false;

  const htmlParts = cells.map((cell, index) => {
    const cellId = escapeHtml(cell.id);
    if (cell.type === 'code' || cell.type === 'hybrid') {
      // code和Hybrid cell转换为可执行代码块，确保包含正确的ID和位置信息
      if (DEBUG) console.log(`转换代码块 ${index}: ID=${cell.id}, type=${cell.type}`);
      return `<div data-type="executable-code-block" data-language="${escapeHtml((cell as any).language || 'python')}" data-code="${encodeURIComponent(cell.content || '')}" data-cell-id="${cellId}" data-outputs="${encodeURIComponent(JSON.stringify(cell.outputs || []))}" data-enable-edit="${cell.enableEdit !== false}" data-original-type="${cell.type}" data-is-generating="${(cell as any).metadata?.isGenerating === true}"></div>`;
    } else if (cell.type === 'markdown') {
      if (cell.metadata?.editorMode === 'source') {
        const sourceCellType = parseSourceCellType(cell.metadata.sourceCellType);
        return `<div data-type="markdown-source-cell" data-cell-id="${cellId}" data-source="${encodeURIComponent(cell.content)}"${sourceCellType ? ` data-source-cell-type="${sourceCellType}"` : ''}></div>`;
      }
      // markdown cell转换为HTML
      // For the first cell, check if it has cover/icon metadata and should be rendered as title
      if (includeDocumentFrame && index === 0 && /^#(?:\s|$)/.test(cell.content.trim())) {
        const metadata = cell.metadata || {};
        const cover = metadata.cover || null;
        const icon = metadata.icon || null;

        // Extract title text (remove # prefix)
        const titleText = cell.content
          .trim()
          .replace(/^#\s*/, '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        titleGenerated = true;
        // Create title node with cover, icon, and cellId attributes
        return `<div data-type="title" data-cover="${escapeHtml(cover || '')}" data-icon="${escapeHtml(icon || '')}" data-cell-id="${cellId}">${titleText}</div>`;
      }
      if (DEBUG)
        console.log(`转换Markdown单元格 ${index}: ID=${cell.id}, content="${cell.content}"`);
      const html = convertMarkdownToHtml(cell.content || '', cell, headingSlugCounter);
      if (DEBUG) console.log(`Markdown转HTML结果 ${index}: "${html}"`);
      return `<div data-type="markdown-cell" data-cell-id="${cellId}"${cell.phaseId ? ` data-phase-id="${escapeHtml(cell.phaseId)}"` : ''}>${html}</div>`;
    } else if (cell.type === 'image') {
      // image cell转换为HTML - 包含cellId和metadata信息
      if (DEBUG) console.log(`转换图片单元格 ${index}: ID=${cell.id}`);

      // 解析 markdown 以提取 src 和 alt
      const markdownContent = cell.content || '';
      const markdownMatch = markdownContent.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      const parsedSrc = markdownMatch ? markdownMatch[2] : '';
      const parsedAlt = markdownMatch ? markdownMatch[1] : 'Cell image';

      if (DEBUG) {
        console.log(`📝 解析图片markdown:`, {
          original: markdownContent,
          src: parsedSrc,
          alt: parsedAlt,
        });
      }

      // Generation state is store-owned and observed directly by ImageView.
      return `<div data-type="image-cell" data-cell-id="${escapeHtml(cell.id)}"><div data-type="markdown-image" data-cell-id="${escapeHtml(cell.id)}" data-src="${escapeHtml(parsedSrc)}" data-alt="${escapeHtml(parsedAlt)}" data-markdown="${escapeHtml(markdownContent)}" data-display-mode="true"></div></div>`;
    } else if (cell.type === 'thinking') {
      // thinking cell转换为HTML
      if (DEBUG) console.log(`转换AI思考单元格 ${index}: ID=${cell.id}`);
      return `<div data-type="thinking-cell" data-cell-id="${cellId}" data-agent-name="${escapeHtml((cell as any).agentName || 'AI')}" data-custom-text="${encodeURIComponent((cell as any).customText || '')}" data-text-array="${encodeURIComponent(JSON.stringify((cell as any).textArray || []))}" data-use-workflow-thinking="${Boolean((cell as any).useWorkflowThinking)}"></div>`;
    } else if (cell.type === 'link') {
      const md = String(cell.content || '').trim();
      const m = md.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = m ? m[2] : md;
      const label = m ? m[1] : href.split(/[\\/]/).pop() || href;
      // 使用附件节点渲染，保持与Jupyter一致的卡片UI，并传入真实 cellId
      return `<div data-type="file-attachment" data-cell-id="${cellId}" data-markdown="${escapeHtml(`[${label}](${href})`)}"></div>`;
    } else if (cell.type === 'raw') {
      // raw cell：原样存储文本，不作为markdown解释
      if (DEBUG) console.log(`转换Raw单元格 ${index}: ID=${cell.id}`);
      return `<div data-type="raw-block" data-cell-id="${cellId}" data-content="${encodeURIComponent(cell.content || '')}"></div>`;
    }

    return '';
  });

  let result = htmlParts.join('\n');

  // Ensure a title exists at the beginning if one wasn't generated from the first cell
  if (includeDocumentFrame && !titleGenerated) {
    if (DEBUG) console.log('⚠️ No title found in first cell, injecting empty title');
    result = `<div data-type="title" data-cell-id="${generateCellId()}"></div>\n${result}`;
  } else if (includeDocumentFrame && cells.length === 1) {
    // If we have a title but no other cells, append an empty paragraph to satisfy 'title block+' schema
    if (DEBUG) console.log('⚠️ Only title found, appending empty paragraph to satisfy schema');
    result += '\n<p></p>';
  }

  if (DEBUG) console.log('=== convertCellsToHtml 完成 ===');
  return result;
}

/**
 * 将 ProseMirror 节点转换为 Markdown 文本（保留常见格式）
 */
function wrapInlineMark(text: string, delimiter: string): string {
  const [, leading, body, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  // Markdown emphasis delimiters cannot open/close against whitespace.
  return body ? `${leading}${delimiter}${body}${delimiter}${trailing}` : text;
}

export interface MarkdownSerializationOptions {
  transformFence?: (node: any, source: string) => string;
  tableCell?: boolean;
}

export function extractTextFromNode(node: any, options?: MarkdownSerializationOptions): string {
  // 处理纯文本并考虑 marks（bold / italic / code）
  if (node.text !== undefined) {
    let text = node.text as string;
    const marks = Array.isArray(node.marks) ? node.marks : [];
    if (!marks.some((mark: any) => mark.type === 'code')) {
      text = text
        .replace(/&/g, '&amp;')
        .replace(/[\\`*_[\]<>~$#|!:@]/g, '\\$&')
        .replace(/\bwww\./gi, (prefix) => prefix.slice(0, -1) + '\\.')
        .replace(/^(\s*)(\d+)([.)])(?=\s)/gm, '$1$2\\$3')
        .replace(/^([ \t]*)([-+=>])/gm, '$1\\$2');
    }
    if (Array.isArray(node.marks)) {
      // Code owns the literal payload; links wrap the final formatted label.
      const orderedMarks = [
        ...marks.filter((mark: any) => mark.type === 'code'),
        ...marks.filter((mark: any) => mark.type !== 'code' && mark.type !== 'link'),
        ...marks.filter((mark: any) => mark.type === 'link'),
      ];
      orderedMarks.forEach((mark: any) => {
        switch (mark.type) {
          case 'bold':
            text = wrapInlineMark(text, '**');
            break;
          case 'italic':
            text = wrapInlineMark(text, '*');
            break;
          case 'code':
            {
              if (options?.tableCell && text.includes('|')) {
                text = encodeTableCode(text);
                break;
              }
              const runs = text.match(/`+/g) || [];
              const delimiter = '`'.repeat(
                runs.reduce((length, run) => Math.max(length, run.length + 1), 1)
              );
              const padding =
                /^`|`$/.test(text) || (/^ .* $/.test(text) && /[^ ]/.test(text)) ? ' ' : '';
              text = `${delimiter}${padding}${text}${padding}${delimiter}`;
            }
            break;
          case 'strike':
            text = wrapInlineMark(text, '~~');
            break;
          case 'link':
            text = `[${text}](<${String(mark.attrs?.href || '')
              .replace(/</g, '%3C')
              .replace(
                />/g,
                '%3E'
              )}>${mark.attrs?.title ? ` "${String(mark.attrs.title).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''})`;
            break;
          default:
            break;
        }
      });
    }
    return text;
  }

  // 处理不同类型节点
  switch (node.type) {
    case 'paragraph':
      if (node.content && Array.isArray(node.content)) {
        return node.content.map((child: any) => extractTextFromNode(child, options)).join('');
      }
      return '';

    case 'blockquote': {
      const inner = (node.content || [])
        .map((child: any) => serializeMarkdownBlock(child, options))
        .join('\n\n');
      return inner
        .split('\n')
        .map((line: string) => line.length === 0 ? '>' : `> ${line}`)
        .join('\n');
    }

    case 'bulletList':
    case 'orderedList': {
      const start = node.attrs?.start ?? 1;
      return (node.content || [])
        .map((item: any, index: number) => {
          const prefix = node.type === 'orderedList' ? `${start + index}. ` : '- ';
          const body = (item.content || [])
            .map((child: any) => serializeMarkdownBlock(child, options))
            .join('\n\n');
          return body
            .split('\n')
            .map(
              (line: string, lineIndex: number) =>
                `${lineIndex ? ' '.repeat(prefix.length) : prefix}${line}`
            )
            .join('\n');
        })
        .join('\n');
    }

    case 'listItem': {
      return (node.content || [])
        .map((child: any) => serializeMarkdownBlock(child, options))
        .join('\n\n');
    }

    case 'hardBreak':
      return options?.tableCell ? '<br>' : '\n';

    case 'text':
      return node.text || '';

    case 'latexBlock': {
      const latex = node.attrs?.latex || '';
      const displayMode = node.attrs?.displayMode;
      return displayMode ? `$$${latex}$$` : `$${latex}$`;
    }

    case 'markdownImage': {
      // 处理行内图片节点，返回 markdown 格式的图片
      const attrs = node.attrs || {};
      const markdown = attrs.markdown || '';
      if (markdown) {
        return markdown;
      }
      // 如果没有 markdown 属性，从 src 和 alt 构造
      const src = attrs.src || '';
      const alt = attrs.alt || '';
      return src ? `![${alt}](${src})` : '';
    }

    default: {
      // 递归子节点
      if (node.content && Array.isArray(node.content)) {
        return node.content.map((child: any) => extractTextFromNode(child, options)).join('');
      }
      return '';
    }
  }
}

export function serializeMarkdownBlock(node: any, options?: MarkdownSerializationOptions): string {
  if (node.type === 'mermaidBlock' || node.type === 'fencedCodeBlock') {
    const code =
      node.type === 'mermaidBlock'
        ? node.attrs?.code || ''
        : (node.content || []).map((child: any) => child.text || '').join('');
    const original = standaloneFence(node.attrs?.source || '');
    const source =
      original && original.code.replace(/\r\n?/g, '\n') === code.replace(/\r\n?/g, '\n')
        ? original.source
        : original ? replaceFencedCode(original, code) : formatCodeFence(
            code,
            node.type === 'mermaidBlock' ? 'mermaid' : node.attrs?.language || ''
          );
    return options?.transformFence ? options.transformFence(node, source) : source;
  }
  if (node.type === 'heading') {
    return `${'#'.repeat(node.attrs?.level || 1)} ${extractTextFromNode(node)}`;
  }
  if (node.type === 'table') {
    if (requiresHtmlTable(node)) {
      return serializeHtmlTable(node, (child) =>
        serializeTableBlock(child, (fence) => serializeMarkdownBlock(fence, options))
      );
    }
    const rows: string[][] = (node.content || []).map((row: any) =>
      (row.content || []).map((cell: any) =>
        (cell.content || [])
          .map((child: any) => extractTextFromNode(child, { ...options, tableCell: true }))
          .join('')
          .trim()
      )
    );
    if (rows.length === 0) return '';
    const formatRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
    return [
      formatRow(rows[0]),
      formatRow(
        (node.content[0].content || []).map((cell: any) => {
          switch (cell.attrs?.textAlign) {
            case 'left':
              return ':---';
            case 'center':
              return ':---:';
            case 'right':
              return '---:';
            default:
              return '---';
          }
        })
      ),
      ...rows.slice(1).map(formatRow),
    ].join('\n');
  }
  return extractTextFromNode(node, options).trimEnd();
}

function imageCellFromAttributes(attrs: any, cellId: string): Cell {
  const markdown = attrs.markdown || (attrs.src ? `![${attrs.alt || ''}](${attrs.src})` : '');
  return {
    id: cellId,
    type: 'image',
    content: markdown,
    outputs: [],
    enableEdit: true,
  };
}

/**
 * 新方案：使用 ProseMirror JSON 而不是 HTML 解析
 */
const projectedDocuments = new WeakMap<object, { doc: ProseMirrorNode; cells: Cell[] }>();
const projectedBlocks = new WeakMap<ProseMirrorNode, Cell[]>();
const cellNodeTypes = new Set([
  'title',
  'markdownCell',
  'markdownSourceCell',
  'imageCell',
  'markdownImage',
  'executableCodeBlock',
  'rawBlock',
  'thinkingCell',
  'fileAttachment',
]);

/** Immutable ProseMirror nodes are shared across transactions, including undo. */
export function convertEditorStateToCells(editor: any): Cell[] {
  if (!editor) return [];
  const doc: ProseMirrorNode = editor.state.doc;
  const cached = projectedDocuments.get(editor);
  if (cached?.doc === doc) return cached.cells;
  const cells: Cell[] = [];
  let unwrapped: any[] = [];
  const flush = () => {
    if (unwrapped.length) {
      cells.push(...projectJsonToCells({ content: unwrapped }));
      unwrapped = [];
    }
  };
  doc.forEach((node) => {
    if (!cellNodeTypes.has(node.type.name)) {
      unwrapped.push(node.toJSON());
      return;
    }
    flush();
    let blockCells = projectedBlocks.get(node);
    if (!blockCells) {
      blockCells = projectJsonToCells({ content: [node.toJSON()] });
      projectedBlocks.set(node, blockCells);
    }
    cells.push(...blockCells);
  });
  flush();
  projectedDocuments.set(editor, { doc, cells });
  return cells;
}

function projectJsonToCells(docJson: any): Cell[] {
  if (DEBUG) console.log('📋 Editor JSON:', docJson);

  if (!docJson.content || docJson.content.length === 0) {
    return [];
  }

  const newCells: Cell[] = [];
  let currentMarkdownContent: string[] = [];

  const flushMarkdownContent = () => {
    if (currentMarkdownContent.length > 0) {
      const markdownText = currentMarkdownContent.join('\n').trim();
      if (markdownText) {
        newCells.push({
          id: generateCellId(),
          type: 'markdown',
          content: markdownText,
          outputs: [],
          enableEdit: true,
        });
      }
      currentMarkdownContent = [];
    }
  };

  docJson.content.forEach((node: any, idx: number) => {
    if (DEBUG) console.log(`🔍 处理节点 ${idx}:`, { type: node.type, attrs: node.attrs });

    if (node.type === 'markdownSourceCell') {
      flushMarkdownContent();
      const sourceCellType = parseSourceCellType(node.attrs.sourceCellType);
      newCells.push({
        id: node.attrs.cellId,
        type: 'markdown',
        content: node.attrs.source,
        outputs: [],
        enableEdit: true,
        metadata: { editorMode: 'source', ...(sourceCellType && { sourceCellType }) },
      });
    } else if (node.type === 'markdownCell') {
      flushMarkdownContent();
      newCells.push({
        id: node.attrs?.cellId || generateCellId(),
        ...(node.attrs?.phaseId && { phaseId: node.attrs.phaseId }),
        type: 'markdown',
        content: (node.content || [])
          .map((child: any) => serializeMarkdownBlock(child))
          .join('\n\n'),
        outputs: [],
        enableEdit: true,
      });
    } else if (node.type === 'imageCell') {
      flushMarkdownContent();
      const imageNode = (node.content || []).find((child: any) => child.type === 'markdownImage');
      const attrs = imageNode?.attrs || {};
      newCells.push(
        imageCellFromAttributes(attrs, node.attrs?.cellId || attrs.cellId || generateCellId())
      );
    } else if (node.type === 'markdownImage') {
      // 处理图片节点 - 先清空累积的markdown内容
      flushMarkdownContent();

      const attrs = node.attrs || {};
      const cellId = attrs.cellId || generateCellId();
      newCells.push(imageCellFromAttributes(attrs, cellId));
    } else if (node.type === 'executableCodeBlock') {
      // 处理代码块
      flushMarkdownContent();
      const attrs = node.attrs || {};
      const cellId = attrs.cellId || generateCellId();
      newCells.push(codeCellFromAttributes(attrs, cellId));
    } else if (node.type === 'rawBlock') {
      // 处理Raw块
      flushMarkdownContent();
      const attrs = node.attrs || {};
      const cellId = attrs.cellId || generateCellId();
      newCells.push({
        id: cellId,
        type: 'raw',
        // The raw-node HTML boundary already decoded this attribute.
        content: attrs.content || '',
        outputs: [],
        enableEdit: true,
      } as any);
    } else if (node.type === 'thinkingCell') {
      // 处理AI思考单元格
      flushMarkdownContent();

      const attrs = node.attrs || {};
      const cellId = attrs.cellId || generateCellId();

      newCells.push({
        id: cellId,
        type: 'thinking',
        content: '',
        outputs: [],
        enableEdit: false,
      } as any);
    } else if (node.type === 'fileAttachment') {
      // Tiptap FileAttachment 节点 -> 链接 cell
      flushMarkdownContent();
      const attrs = node.attrs || {};
      const cellId = attrs.cellId || generateCellId();
      const markdown = attrs.markdown || '';
      newCells.push({
        id: cellId,
        type: 'link',
        content: markdown,
        outputs: [],
        enableEdit: true,
      } as any);
    } else if (node.type === 'title') {
      // Treat title as H1 and save cover/icon to metadata
      flushMarkdownContent();
      // Notebook title is a plain-text field; its loader does not parse Markdown.
      const headingText = (node.content || [])
        .map((child: any) => child.text || '')
        .join('')
        .trim();
      const markdownHeading = `# ${headingText}`;
      const metadata: any = {};

      // Save cover and icon from title node attributes
      if (node.attrs) {
        if (node.attrs.cover) {
          metadata.cover = node.attrs.cover;
        }
        if (node.attrs.icon) {
          metadata.icon = node.attrs.icon;
        }
      }

      // Use cellId from node attrs if available, otherwise generate new one
      const cellId = node.attrs?.cellId || generateCellId();

      newCells.push({
        id: cellId,
        type: 'markdown',
        content: markdownHeading,
        outputs: [],
        enableEdit: true,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } else if (node.type === 'heading') {
      // Treat headings as independent markdown cells (#, ## ...)
      flushMarkdownContent();
      const level = node.attrs && node.attrs.level ? node.attrs.level : 1;
      const headingText = extractTextFromNode(node).trim();
      if (headingText) {
        const markdownHeading = `${'#'.repeat(level)} ${headingText}`;
        newCells.push({
          id: generateCellId(),
          type: 'markdown',
          content: markdownHeading,
          outputs: [],
          enableEdit: true,
        });
      }
    } else if (node.type === 'paragraph') {
      // 如果整段仅由带 link 标记的文本组成，则作为独立的 link cell
      const contentArr: any[] = Array.isArray(node.content) ? node.content : [];
      let href: string | null = null;
      let labelParts: string[] = [];
      let onlyLink = contentArr.length > 0;
      for (const child of contentArr) {
        if (child.type !== 'text' || typeof child.text !== 'string') {
          onlyLink = false;
          break;
        }
        const marks = Array.isArray(child.marks) ? child.marks : [];
        const linkMark = marks.find((m: any) => m && m.type === 'link' && m.attrs && m.attrs.href);
        if (!linkMark) {
          onlyLink = false;
          break;
        }
        if (href && href !== linkMark.attrs.href) {
          onlyLink = false;
          break;
        }
        href = linkMark.attrs.href;
        labelParts.push(child.text);
        // 不允许除 link 外的其它 mark
        if (marks.some((m: any) => m && m.type !== 'link')) {
          onlyLink = false;
          break;
        }
      }
      if (onlyLink && href) {
        flushMarkdownContent();
        const label = labelParts.join('');
        newCells.push({
          id: generateCellId(),
          type: 'link',
          content: `[${label}](${href})`,
          outputs: [],
          enableEdit: true,
        } as any);
      } else {
        // 普通段落，作为 markdown 文本累积
        const textContent = extractTextFromNode(node);
        if (textContent.trim()) {
          currentMarkdownContent.push(textContent);
        }
      }
    } else {
      // 其他节点作为 markdown 处理
      const textContent = extractTextFromNode(node);
      if (textContent.trim()) {
        currentMarkdownContent.push(textContent);
      }
    }
  });

  // 处理剩余的markdown内容
  flushMarkdownContent();

  if (DEBUG)
    console.log(
      '📋 转换结果:',
      newCells.map((c) => ({ id: c.id, type: c.type, contentLength: c.content?.length }))
    );
  return newCells;
}
