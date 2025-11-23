/**
 * Cell conversion utilities for TiptapNotebookEditor
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Cell, CellType } from '@Store/models';
import {
  convertMarkdownToHtml,
  convertHtmlToMarkdown,
  convertTableToMarkdown,
} from './markdownConverters';

// Debug flag - set to true only when debugging
const DEBUG = true;

/**
 * 生成唯一的cell ID
 */
export function generateCellId() {
  return `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 将cells数组转换为HTML内容
 */
export function convertCellsToHtml(cells: Cell[]) {
  if (!cells || cells.length === 0) {
    // Schema requires 'title block+', so return default title and empty paragraph
    return '<div data-type="title">Untitled</div><p></p>';
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
    if (cell.type === 'code' || cell.type === 'hybrid') {
      // code和Hybrid cell转换为可执行代码块，确保包含正确的ID和位置信息
      if (DEBUG) console.log(`转换代码块 ${index}: ID=${cell.id}, type=${cell.type}`);
      return `<div data-type="executable-code-block" data-language="${(cell as any).language || 'python'}" data-code="${encodeURIComponent(cell.content || '')}" data-cell-id="${cell.id}" data-outputs="${encodeURIComponent(JSON.stringify(cell.outputs || []))}" data-enable-edit="${cell.enableEdit !== false}" data-original-type="${cell.type}" data-is-generating="${(cell as any).metadata?.isGenerating === true}"></div>`;
    } else if (cell.type === 'markdown') {
      // markdown cell转换为HTML
      // For the first cell, check if it has cover/icon metadata and should be rendered as title
      if (index === 0 && cell.content.trim().startsWith('#')) {
        const metadata = cell.metadata || {};
        const cover = metadata.cover || null;
        const icon = metadata.icon || null;

        // Extract title text (remove # prefix)
        const titleText = cell.content.trim().replace(/^#+\s*/, '');

        titleGenerated = true;
        // Create title node with cover, icon, and cellId attributes
        return `<div data-type="title" data-cover="${cover || ''}" data-icon="${icon || ''}" data-cell-id="${cell.id}">${titleText}</div>`;
      }
      if (DEBUG)
        console.log(`转换Markdown单元格 ${index}: ID=${cell.id}, content="${cell.content}"`);
      const html = convertMarkdownToHtml(cell.content || '', cell, headingSlugCounter);
      if (DEBUG) console.log(`Markdown转HTML结果 ${index}: "${html}"`);
      return html;
    } else if (cell.type === 'image') {
      // image cell转换为HTML - 包含cellId和metadata信息
      if (DEBUG) console.log(`转换图片单元格 ${index}: ID=${cell.id}`);
      const metadata = cell.metadata || {};

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

      return `<div data-type="markdown-image" data-cell-id="${cell.id}" data-src="${parsedSrc}" data-alt="${parsedAlt}" data-markdown="${markdownContent}" data-is-generating="${metadata.isGenerating || false}" data-generation-type="${metadata.generationType || ''}" data-generation-prompt="${metadata.prompt || ''}" data-generation-params="${encodeURIComponent(JSON.stringify(metadata.generationParams || {}))}" data-generation-start-time="${metadata.generationStartTime || ''}" data-generation-error="${metadata.generationError || ''}" data-generation-status="${metadata.generationStatus || ''}"></div>`;
    } else if (cell.type === 'thinking') {
      // thinking cell转换为HTML
      if (DEBUG) console.log(`转换AI思考单元格 ${index}: ID=${cell.id}`);
      return `<div data-type="thinking-cell" data-cell-id="${cell.id}" data-agent-name="${(cell as any).agentName || 'AI'}" data-custom-text="${encodeURIComponent((cell as any).customText || '')}" data-text-array="${encodeURIComponent(JSON.stringify((cell as any).textArray || []))}" data-use-workflow-thinking="${(cell as any).useWorkflowThinking || false}"></div>`;
    } else if (cell.type === 'link') {
      const md = String(cell.content || '').trim();
      const m = md.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = m ? m[2] : md;
      const label = m ? m[1] : href.split(/[\\/]/).pop() || href;
      // 使用附件节点渲染，保持与Jupyter一致的卡片UI，并传入真实 cellId
      return `<div data-type="file-attachment" data-cell-id="${cell.id}" data-markdown="[${label}](${href})"></div>`;
    } else if (cell.type === 'raw') {
      // raw cell：原样存储文本，不作为markdown解释
      if (DEBUG) console.log(`转换Raw单元格 ${index}: ID=${cell.id}`);
      return `<div data-type="raw-block" data-cell-id="${cell.id}" data-content="${encodeURIComponent(cell.content || '')}"></div>`;
    }

    return '';
  });

  let result = htmlParts.join('\n');

  // Ensure a title exists at the beginning if one wasn't generated from the first cell
  if (!titleGenerated) {
    if (DEBUG) console.log('⚠️ No title found in first cell, injecting default Untitled title');
    result = `<div data-type="title">Untitled</div>\n${result}`;
  } else if (cells.length === 1) {
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
export function extractTextFromNode(node: any, parentType: string | null = null): string {
  // 处理纯文本并考虑 marks（bold / italic / code）
  if (node.text !== undefined) {
    let text = node.text as string;
    if (Array.isArray(node.marks)) {
      node.marks.forEach((mark: any) => {
        switch (mark.type) {
          case 'bold':
            text = `**${text}**`;
            break;
          case 'italic':
            text = `*${text}*`;
            break;
          case 'code':
            text = `\`${text}\``;
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
        return node.content.map((child: any) => extractTextFromNode(child)).join('');
      }
      return '';

    case 'blockquote': {
      // 每一行前缀 '> '
      const inner = (node.content || []).map((child: any) => extractTextFromNode(child)).join('');
      // 确保换行
      return `> ${inner}\n`;
    }

    case 'bulletList': {
      return (node.content || []).map((li: any) => extractTextFromNode(li, 'bullet')).join('');
    }

    case 'orderedList': {
      let counter = 1;
      return (node.content || [])
        .map((li: any) => {
          const line = extractTextFromNode(li, 'ordered');
          const prefix = `${counter++}. `;
          return line.replace(/^-/, '').replace(/^\s*/, prefix);
        })
        .join('');
    }

    case 'listItem': {
      const inner = (node.content || []).map((child: any) => extractTextFromNode(child)).join('');
      const prefix = parentType === 'ordered' ? '- ' : '- ';
      return `${prefix}${inner}\n`;
    }

    case 'hardBreak':
      return '\n';

    case 'text':
      return node.text || '';

    default: {
      // 递归子节点
      if (node.content && Array.isArray(node.content)) {
        return node.content.map((child: any) => extractTextFromNode(child)).join('');
      }
      return '';
    }
  }
}

/**
 * 新方案：使用 ProseMirror JSON 而不是 HTML 解析
 */
export function convertEditorStateToCells(editor: any): Cell[] {
  if (!editor) {
    return [];
  }

  try {
    const docJson = editor.state.doc.toJSON();
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
          // 检查是否是重复的标题内容，但允许替换默认的 "Untitled" 标题
          const isDuplicateTitle =
            markdownText.startsWith('#') &&
            newCells.some((cell) => {
              if (cell.type === 'markdown' && cell.content.trim() === markdownText.trim()) {
                // 如果是默认的 "Untitled" 标题，允许被替换
                return !(
                  cell.content.trim() === '# Untitled' && markdownText.trim() !== '# Untitled'
                );
              }
              return false;
            });

          if (!isDuplicateTitle) {
            // 如果新标题不是 "Untitled"，移除现有的默认 "Untitled" 标题
            if (markdownText.startsWith('#') && markdownText.trim() !== '# Untitled') {
              const untitledIndex = newCells.findIndex(
                (cell) => cell.type === 'markdown' && cell.content.trim() === '# Untitled'
              );
              if (untitledIndex !== -1) {
                newCells.splice(untitledIndex, 1);
                if (DEBUG)
                  console.log(
                    '🔄 移除默认的 Untitled 标题，替换为:',
                    markdownText.substring(0, 30)
                  );
              }
            }

            newCells.push({
              id: generateCellId(),
              type: 'markdown',
              content: markdownText,
              outputs: [],
              enableEdit: true,
            });
          } else {
            if (DEBUG) console.log('🚫 跳过重复的标题内容:', markdownText.substring(0, 30));
          }
        }
        currentMarkdownContent = [];
      }
    };

    docJson.content.forEach((node: any, idx: number) => {
      if (DEBUG) console.log(`🔍 处理节点 ${idx}:`, { type: node.type, attrs: node.attrs });

      if (node.type === 'markdownImage') {
        // 处理图片节点 - 先清空累积的markdown内容
        flushMarkdownContent();

        const attrs = node.attrs || {};
        const cellId = attrs.cellId || generateCellId();
        const markdown = attrs.markdown || '';

        if (DEBUG)
          console.log(
            `✅ 发现 markdownImage 节点: ${cellId}, content: ${markdown.substring(0, 50)}`
          );

        // 创建独立的image cell
        newCells.push({
          id: cellId,
          type: 'image',
          content: markdown,
          outputs: [],
          enableEdit: true,
          metadata: {
            isGenerating: attrs.isGenerating || false,
            generationType: attrs.generationType || '',
            prompt: attrs.prompt || '',
            generationStartTime: attrs.generationStartTime,
            generationError: attrs.generationError,
            generationStatus: attrs.generationStatus,
            generationParams: attrs.generationParams || {},
          },
        });
      } else if (node.type === 'executableCodeBlock') {
        // 处理代码块
        flushMarkdownContent();
        const attrs = node.attrs || {};
        const cellId = attrs.cellId || generateCellId();
        // 解码代码内容及输出
        let codeContent = '';
        if (attrs.code) {
          try {
            codeContent = decodeURIComponent(attrs.code);
          } catch {
            codeContent = attrs.code;
          }
        }
        let outputsParsed: any[] = [];
        if (attrs.outputs) {
          try {
            outputsParsed = JSON.parse(decodeURIComponent(attrs.outputs));
          } catch {
            try {
              outputsParsed = JSON.parse(attrs.outputs);
            } catch {
              // ignore parse error
            }
          }
        }
        newCells.push({
          id: cellId,
          type: (attrs.originalType || 'code') as CellType,
          content: codeContent,
          outputs: outputsParsed,
          enableEdit: attrs.enableEdit !== false,
          metadata: { ...(attrs.metadata || {}), isGenerating: attrs.isGenerating === true },
          ...(attrs.originalType !== 'markdown' && { language: attrs.language || 'python' }),
        } as any);
      } else if (node.type === 'rawBlock') {
        // 处理Raw块
        flushMarkdownContent();
        const attrs = node.attrs || {};
        const cellId = attrs.cellId || generateCellId();
        let txt = attrs.content || '';
        try {
          txt = decodeURIComponent(txt);
        } catch {
          // Keep original text if decode fails
        }
        newCells.push({
          id: cellId,
          type: 'raw',
          content: txt,
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
        const headingText = extractTextFromNode(node).trim();
        if (headingText) {
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
        }
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
          const linkMark = marks.find(
            (m: any) => m && m.type === 'link' && m.attrs && m.attrs.href
          );
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
  } catch (error) {
    console.error('❌ JSON 解析失败，回退到 HTML 解析:', error);
    return convertHtmlToCells_fallback(editor);
  }
}

/**
 * 备用的 HTML 解析方案
 */
function convertHtmlToCells_fallback(editor: any) {
  const html = editor?.getHTML() || '';
  if (!html || html === '<p></p>') {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const newCells: Cell[] = [];
  let currentMarkdownContent: string[] = [];

  // Helper function to flush accumulated content
  const flushMarkdownContent = () => {
    if (currentMarkdownContent.length > 0) {
      const markdownText = currentMarkdownContent.join('\n').trim();
      if (markdownText) {
        const convertedMarkdown = convertHtmlToMarkdown(markdownText);

        // 检查是否是重复的标题内容，但允许替换默认的 "Untitled" 标题
        const isDuplicateTitle =
          convertedMarkdown.startsWith('#') &&
          newCells.some((cell) => {
            if (cell.type === 'markdown' && cell.content.trim() === convertedMarkdown.trim()) {
              // 如果是默认的 "Untitled" 标题，允许被替换
              return !(
                cell.content.trim() === '# Untitled' && convertedMarkdown.trim() !== '# Untitled'
              );
            }
            return false;
          });

        if (!isDuplicateTitle) {
          // 如果新标题不是 "Untitled"，移除现有的默认 "Untitled" 标题
          if (convertedMarkdown.startsWith('#') && convertedMarkdown.trim() !== '# Untitled') {
            const untitledIndex = newCells.findIndex(
              (cell) => cell.type === 'markdown' && cell.content.trim() === '# Untitled'
            );
            if (untitledIndex !== -1) {
              newCells.splice(untitledIndex, 1);
              if (DEBUG)
                console.log(
                  '🔄 移除默认的 Untitled 标题 (HTML)，替换为:',
                  convertedMarkdown.substring(0, 30)
                );
            }
          }

          newCells.push({
            id: generateCellId(),
            type: 'markdown',
            content: convertedMarkdown,
            outputs: [],
            enableEdit: true,
          });
        } else {
          if (DEBUG)
            console.log('🚫 跳过重复的标题内容 (HTML):', convertedMarkdown.substring(0, 30));
        }
      }
      currentMarkdownContent = [];
    }
  };

  // Check if an element is a heading
  const isHeading = (element: HTMLElement) => {
    return element.tagName && /^H[1-6]$/.test(element.tagName.toUpperCase());
  };

  // 遍历所有节点
  Array.from(doc.body.childNodes).forEach((node: ChildNode) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // 调试：检查每个元素的 data-type 属性
      const dataType = el.getAttribute('data-type');
      const datasetType = (el as any).dataset?.type;
      const datasetMarkdownImage = (el as any).dataset?.markdownImage;
      if (DEBUG) {
        console.log('🔍 解析节点:', {
          tagName: el.tagName,
          'getAttribute(data-type)': dataType,
          'dataset.type': datasetType,
          'dataset.markdownImage': datasetMarkdownImage,
          outerHTML: el.outerHTML?.substring(0, 100),
        });
      }

      if (el.getAttribute('data-type') === 'executable-code-block') {
        // 如果有累积的markdown内容，先创建markdown cell
        flushMarkdownContent();

        // 对于代码块，记录位置占位符
        const cellId = el.getAttribute('data-cell-id');
        const language = el.getAttribute('data-language') || 'python';
        // const _code = el.getAttribute('data-code') || ''
        const originalType = el.getAttribute('data-original-type') || 'code';

        if (DEBUG)
          console.log(`发现代码块: ${cellId}, 语言: ${language}, 原始类型: ${originalType}`);

        newCells.push({
          id: cellId || generateCellId(),
          type: (originalType as CellType) || 'code',
          content: '',
          outputs: [],
          enableEdit: true,
          metadata: { isGenerating: el.getAttribute('data-is-generating') === 'true' },
        } as any);
      } else if (el.getAttribute('data-type') === 'latex-block') {
        // 处理LaTeX节点
        flushMarkdownContent();

        if (DEBUG) console.log('发现LaTeX节点:', node);

        // LaTeX节点直接累积到markdown内容中，保持原始格式
        const latex = el.getAttribute('data-latex') || '';
        const displayMode = el.getAttribute('data-display-mode') === 'true';

        if (latex) {
          const latexMarkdown = displayMode ? `$$${latex}$$` : `$${latex}$`;
          currentMarkdownContent.push(latexMarkdown);
        }
      } else if (el.getAttribute('data-type') === 'thinking-cell') {
        // 处理AI思考单元格
        flushMarkdownContent();

        const cellId = el.getAttribute('data-cell-id');
        // const _agentName = el.getAttribute('data-agent-name') || 'AI'
        // const _customText = el.getAttribute('data-custom-text') || ''
        // const _textArray = el.getAttribute('data-text-array') || '[]'
        // const _useWorkflowThinking = el.getAttribute('data-use-workflow-thinking') === 'true'

        if (DEBUG) console.log(`发现AI思考单元格: ${cellId}`);

        newCells.push({
          id: cellId || generateCellId(),
          type: 'thinking',
          content: '',
          outputs: [],
          enableEdit: false,
        } as any);
      } else if (el.getAttribute('data-type') === 'markdown-image') {
        // 处理图片节点 - 先清空累积的markdown内容，创建独立的image cell
        flushMarkdownContent();

        if (DEBUG) console.log('发现图片节点:', node);

        // 获取cellId和基本属性
        const cellId = el.getAttribute('data-cell-id') || generateCellId();
        const src = el.getAttribute('data-src') || '';
        const alt = el.getAttribute('data-alt') || '';
        const markdown = el.getAttribute('data-markdown') || '';

        // 获取生成相关的metadata
        const isGenerating = el.getAttribute('data-is-generating') === 'true';
        const generationType = el.getAttribute('data-generation-type') || '';
        const generationPrompt = el.getAttribute('data-generation-prompt') || '';
        const generationStartTime = el.getAttribute('data-generation-start-time') || '';
        const generationError = el.getAttribute('data-generation-error') || '';
        const generationStatus = el.getAttribute('data-generation-status') || '';

        // 解析生成参数
        let generationParams = {};
        try {
          const paramsStr = el.getAttribute('data-generation-params') || '{}';
          generationParams = JSON.parse(decodeURIComponent(paramsStr));
        } catch (e) {
          if (DEBUG) console.warn('解析生成参数失败:', e);
        }

        // 如果有markdown属性，直接使用；否则构造markdown格式
        const imageMarkdown = markdown || (src ? `![${alt}](${src})` : '');

        if (DEBUG)
          console.log(
            `✅ 创建独立的image cell: ${cellId}, content: ${imageMarkdown.substring(0, 50)}`
          );

        // 创建独立的image cell，保留原有的cellId和metadata
        newCells.push({
          id: cellId,
          type: 'image',
          content: imageMarkdown,
          outputs: [],
          enableEdit: true,
          metadata: {
            isGenerating,
            generationType,
            prompt: generationPrompt,
            generationStartTime: generationStartTime ? parseInt(generationStartTime) : undefined,
            generationError: generationError || undefined,
            generationStatus: generationStatus || undefined,
            generationParams,
          },
        });
      } else if (el.getAttribute('data-type') === 'raw-block') {
        // 处理raw块
        flushMarkdownContent();
        const cellId = el.getAttribute('data-cell-id') || generateCellId();
        const rawEncoded = el.getAttribute('data-content') || '';
        let rawText = '';
        try {
          rawText = decodeURIComponent(rawEncoded);
        } catch {
          rawText = rawEncoded;
        }
        newCells.push({
          id: cellId,
          type: 'raw',
          content: rawText,
          outputs: [],
          enableEdit: true,
        } as any);
      } else if (el.tagName && el.tagName.toLowerCase() === 'table') {
        // 处理表格节点
        if (DEBUG) console.log('发现表格节点:', node);

        // 将表格转换为markdown格式
        const tableMarkdown = convertTableToMarkdown(el);
        if (tableMarkdown.trim()) {
          currentMarkdownContent.push(tableMarkdown);
        }
      } else if (isHeading(el)) {
        // 如果是标题，先清空累积的内容，然后为标题创建独立的cell
        flushMarkdownContent();

        // 为标题创建独立的markdown cell
        const headingMarkdown = convertHtmlToMarkdown(el.outerHTML);
        if (headingMarkdown.trim()) {
          newCells.push({
            id: generateCellId(),
            type: 'markdown',
            content: headingMarkdown,
            outputs: [],
            enableEdit: true,
          });
        }
      } else {
        // 普通HTML内容，累积到markdown内容中
        currentMarkdownContent.push(el.outerHTML);
      }
    } else if (node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim()) {
      // 文本节点
      currentMarkdownContent.push(node.textContent || '');
    }
  });

  // 处理剩余的markdown内容
  flushMarkdownContent();

  return newCells;
}
