/**
 * Markdown conversion utilities for TiptapNotebookEditor
 */

// Debug flag - set to true only when debugging
const DEBUG = false;

/**
 * Helper function to convert markdown table to HTML
 */
export function convertMarkdownTableToHtml(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex]

  // Parse header
  const headers = headerLine.split('|')
    .map((h: string) => h.trim())
    .filter(h => h !== '')

  // Find data rows
  const rows: string[][] = []
  let endIndex = startIndex + 1

  for (let i = startIndex + 2; i < lines.length; i++) {
    if (/^\s*\|(.+)\|\s*$/.test(lines[i])) {
      const cells = lines[i].split('|')
        .map((c: string) => c.trim())
        .filter((c: string) => c !== '')
      rows.push(cells)
      endIndex = i
    } else {
      break
    }
  }

  // Generate HTML
  let html = '<table>'

  // Header row
  html += '<tr>'
  headers.forEach((h: string) => {
    html += `<th>${h}</th>`
  })
  html += '</tr>'

  // Data rows
  rows.forEach((row: string[]) => {
    html += '<tr>'
    row.forEach((cell: string) => {
      html += `<td>${cell}</td>`
    })
    html += '</tr>'
  })

  html += '</table>'

  return { html, endIndex }
}

/**
 * Markdown到HTML转换 - 支持格式化标记、LaTeX和图片
 */
export function convertMarkdownToHtml(markdown: string, cell: any = null, headingSlugCounter: any = null) {
  if (!markdown) return '<p></p>'

  // 处理LaTeX语法 - 分步骤处理避免嵌套问题
  let processedText = markdown
  const latexNodes: string[] = []
  let latexCounter = 0

  // 处理图片语法 - 先处理图片，避免与其他格式冲突
  const imageNodes: string[] = []
  let imageCounter = 0

  // 提取并替换markdown图片语法
  processedText = processedText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const placeholder = `__IMAGE_${imageCounter}__`
    imageNodes[imageCounter] = `<div data-type="markdown-image" data-src="${src.trim()}" data-alt="${alt.trim()}" data-title="${alt.trim()}" data-markdown="${_match}"></div>`
    if (DEBUG) console.log('提取图片:', { alt: alt.trim(), src: src.trim(), markdown: _match })
    imageCounter++
    return placeholder
  })

  // 按行处理，判断LaTeX是否独占一行
  const lines = processedText.split('\n')
  const processedLines = lines.map(line => {
    let processedLine = line

    // 检查是否整行只有一个LaTeX公式（可能有前后空格）
    const blockLatexMatch = line.trim().match(/^\$\$([^$]+)\$\$$/)
    if (blockLatexMatch) {
      const placeholder = `__LATEX_BLOCK_${latexCounter}__`
      latexNodes[latexCounter] = `<div data-type="latex-block" data-latex="${blockLatexMatch[1].trim()}" data-display-mode="true"></div>`
      if (DEBUG) console.log('提取独占行的块级LaTeX:', blockLatexMatch[1].trim())
      latexCounter++
      return placeholder
    }

    const inlineBlockLatexMatch = line.trim().match(/^\$([^$]+)\$$/)
    if (inlineBlockLatexMatch) {
      const placeholder = `__LATEX_BLOCK_${latexCounter}__`
      latexNodes[latexCounter] = `<div data-type="latex-block" data-latex="${inlineBlockLatexMatch[1].trim()}" data-display-mode="true"></div>`
      if (DEBUG) console.log('提取独占行的行内LaTeX（显示为块级）:', inlineBlockLatexMatch[1].trim())
      latexCounter++
      return placeholder
    }

    // 处理行内的LaTeX（$$...$$格式但不独占行）
    processedLine = processedLine.replace(/\$\$([^$]+)\$\$/g, (_match, formula) => {
      const placeholder = `__LATEX_INLINE_${latexCounter}__`
      latexNodes[latexCounter] = `<div data-type="latex-block" data-latex="${formula.trim()}" data-display-mode="false"></div>`
      if (DEBUG) console.log('提取行内的$$LaTeX:', formula.trim())
      latexCounter++
      return placeholder
    })

    // 处理行内的LaTeX（$...$格式）
    processedLine = processedLine.replace(/\$([^$]+)\$/g, (_match, formula) => {
      const placeholder = `__LATEX_INLINE_${latexCounter}__`
      latexNodes[latexCounter] = `<div data-type="latex-block" data-latex="${formula.trim()}" data-display-mode="false"></div>`
      if (DEBUG) console.log('提取行内的$LaTeX:', formula.trim())
      latexCounter++
      return placeholder
    })

    return processedLine
  })

  processedText = processedLines.join('\n')

  // Check if markdown contains table syntax
  const tableLines = processedText.split('\n')
  const tableRegex = /^\s*\|(.+)\|\s*$/
  const separatorRegex = /^\s*\|(\s*[-:]+\s*\|)+\s*$/

  // Look for table patterns
  for (let i = 0; i < tableLines.length - 1; i++) {
    if (tableRegex.test(tableLines[i]) && separatorRegex.test(tableLines[i + 1])) {
      // Found a table, convert it to HTML
      const tableHtml = convertMarkdownTableToHtml(tableLines, i)
      if (tableHtml) {
        // Replace the table lines with HTML
        const beforeTable = tableLines.slice(0, i).join('\n')
        const afterTable = tableLines.slice(tableHtml.endIndex + 1).join('\n')

        let result = ''
        if (beforeTable) result += convertMarkdownToHtml(beforeTable, cell)
        result += tableHtml.html
        if (afterTable) result += convertMarkdownToHtml(afterTable, cell)

        return result
      }
    }
  }

  // 处理行内格式化
  function processInlineFormatting(text: string) {
    // 如果是图片占位符，直接返回不处理
    if (text.match(/^__IMAGE_\d+__$/)) {
      return text
    }

    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // 粗体
      .replace(/\*(.*?)\*/g, '<em>$1</em>')              // 斜体
      .replace(/`(.*?)`/g, '<code>$1</code>')            // 行内代码
  }

  // 按段落分割
  const paragraphs = processedText.split('\n\n')

  const htmlParagraphs = paragraphs.map(paragraph => {
    const lines = paragraph.split('\n')

    // 处理列表
    if (lines.some(line => line.trim().startsWith('- '))) {
      const listItems = lines
        .filter(line => line.trim().startsWith('- '))
        .map(line => `<li>${processInlineFormatting(line.trim().slice(2))}</li>`)
        .join('')
      return `<ul>${listItems}</ul>`
    }

    // 处理单行内容
    if (lines.length === 1) {
      const line = lines[0].trim()

      // 检查是否是图片占位符
      if (line.match(/^__IMAGE_\d+__$/)) {
        return line // 直接返回占位符，不做任何处理
      }

      // 生成标题ID用于大纲跳转 - H1和H2使用 phaseId（若存在），否则回退到 cell.id
      const generateHeadingId = () => {
        if (cell) {
          // 优先使用 phaseId（与 OutlineSidebar 的 phase.id 对应），否则回退到 cell.id
          if ((cell as any).phaseId) {
            if (DEBUG) console.log('🎯 使用phaseId作为标题ID:', { cellId: (cell as any).id, phaseId: (cell as any).phaseId, content: line.substring(0, 20) });
            return (cell as any).phaseId;
          }
          if ((cell as any).id) {
            if (DEBUG) console.log('⚠️ 回退使用cellId作为标题ID:', { cellId: (cell as any).id, content: line.substring(0, 20) });
            return (cell as any).id;
          }
        }
        return null;
      };

      if (line.startsWith('# ')) {
        const text = processInlineFormatting(line.slice(2));
        const id = generateHeadingId();
        return id
          ? `<h1 id="${id}" data-level="1" data-base-id="${id}" data-heading-key="${id}">${text}</h1>`
          : `<h1 data-level="1">${text}</h1>`;
      }
      if (line.startsWith('## ')) {
        const text = processInlineFormatting(line.slice(3));
        const id = generateHeadingId();
        return id
          ? `<h2 id="${id}" data-level="2" data-base-id="${id}" data-heading-key="${id}">${text}</h2>`
          : `<h2 data-level="2">${text}</h2>`;
      }
      if (line.startsWith('### ')) {
        const raw = line.slice(4).trim();
        const text = processInlineFormatting(raw);
        const baseId = generateHeadingId();
        let slug = raw.toLowerCase()
          .replace(/<[^>]+>/g, '')
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);
        // 唯一化：同一个baseId下相同slug加序号
        if (headingSlugCounter && baseId) {
          if (!headingSlugCounter.has(baseId)) headingSlugCounter.set(baseId, new Map());
          const map = headingSlugCounter.get(baseId)!;
          const count = (map.get(slug) || 0) + 1;
          map.set(slug, count);
          if (count > 1) slug = `${slug}-${count}`;
        }
        const subId = baseId ? `${baseId}--${slug}` : slug;
        if (DEBUG) console.log('🧭 生成H3子标题ID:', { baseId, slug, subId });
        const occurrence = headingSlugCounter?.get(baseId)?.get(slug.replace(/-\d+$/, '')) || 1;
        return `<h3 id=\"${subId}\" data-level=\"3\" data-base-id=\"${baseId || ''}\" data-heading-key=\"${slug}\" data-occurrence=\"${occurrence}\">${text}</h3>`;
      }
      if (line.startsWith('#### ')) {
        const raw = line.slice(5).trim();
        const text = processInlineFormatting(raw);
        const baseId = generateHeadingId();
        let slug = raw.toLowerCase()
          .replace(/<[^>]+>/g, '')
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);
        if (headingSlugCounter && baseId) {
          if (!headingSlugCounter.has(baseId)) headingSlugCounter.set(baseId, new Map());
          const map = headingSlugCounter.get(baseId)!;
          const count = (map.get(slug) || 0) + 1;
          map.set(slug, count);
          if (count > 1) slug = `${slug}-${count}`;
        }
        const subId = baseId ? `${baseId}--${slug}` : slug;
        if (DEBUG) console.log('🧭 生成H4子标题ID:', { baseId, slug, subId });
        const occurrence = headingSlugCounter?.get(baseId)?.get(slug.replace(/-\d+$/, '')) || 1;
        return `<h4 id=\"${subId}\" data-level=\"4\" data-base-id=\"${baseId || ''}\" data-heading-key=\"${slug}\" data-occurrence=\"${occurrence}\">${text}</h4>`;
      }
      if (line.startsWith('##### ')) {
        const raw = line.slice(6).trim();
        const text = processInlineFormatting(raw);
        const baseId = generateHeadingId();
        let slug = raw.toLowerCase()
          .replace(/<[^>]+>/g, '')
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);
        if (headingSlugCounter && baseId) {
          if (!headingSlugCounter.has(baseId)) headingSlugCounter.set(baseId, new Map());
          const map = headingSlugCounter.get(baseId)!;
          const count = (map.get(slug) || 0) + 1;
          map.set(slug, count);
          if (count > 1) slug = `${slug}-${count}`;
        }
        const subId = baseId ? `${baseId}--${slug}` : slug;
        if (DEBUG) console.log('🧭 生成H5子标题ID:', { baseId, slug, subId });
        const occurrence = headingSlugCounter?.get(baseId)?.get(slug.replace(/-\d+$/, '')) || 1;
        return `<h5 id=\"${subId}\" data-level=\"5\" data-base-id=\"${baseId || ''}\" data-heading-key=\"${slug}\" data-occurrence=\"${occurrence}\">${text}</h5>`;
      }
      if (line.startsWith('###### ')) {
        const raw = line.slice(7).trim();
        const text = processInlineFormatting(raw);
        const baseId = generateHeadingId();
        let slug = raw.toLowerCase()
          .replace(/<[^>]+>/g, '')
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);
        if (headingSlugCounter && baseId) {
          if (!headingSlugCounter.has(baseId)) headingSlugCounter.set(baseId, new Map());
          const map = headingSlugCounter.get(baseId)!;
          const count = (map.get(slug) || 0) + 1;
          map.set(slug, count);
          if (count > 1) slug = `${slug}-${count}`;
        }
        const subId = baseId ? `${baseId}--${slug}` : slug;
        if (DEBUG) console.log('🧭 生成H6子标题ID:', { baseId, slug, subId });
        const occurrence = headingSlugCounter?.get(baseId)?.get(slug.replace(/-\d+$/, '')) || 1;
        return `<h6 id=\"${subId}\" data-level=\"6\" data-base-id=\"${baseId || ''}\" data-heading-key=\"${slug}\" data-occurrence=\"${occurrence}\">${text}</h6>`;
      }
      if (line.startsWith('> ')) {
        return `<blockquote>${processInlineFormatting(line.slice(2))}</blockquote>`
      }
      if (line === '') {
        return '<br>'
      }
      return `<p>${processInlineFormatting(line)}</p>`
    }

    // 多行段落
    const processedLines = lines.map(line => {
      const trimmedLine = line.trim()
      // 如果整行是图片占位符，单独处理
      if (trimmedLine.match(/^__IMAGE_\d+__$/)) {
        return trimmedLine
      }
      return processInlineFormatting(line)
    }).join('<br>')
    return `<p>${processedLines}</p>`
  })

  let result = htmlParagraphs.join('')

  // 恢复图片节点占位符
  for (let i = 0; i < imageCounter; i++) {
    result = result.replace(`__IMAGE_${i}__`, imageNodes[i])
  }

  // 恢复LaTeX节点占位符
  for (let i = 0; i < latexCounter; i++) {
    result = result.replace(`__LATEX_BLOCK_${i}__`, latexNodes[i])
    result = result.replace(`__LATEX_INLINE_${i}__`, latexNodes[i])
  }

  if (DEBUG) {
    console.log('转换完成，包含LaTeX节点数:', latexCounter, '图片节点数:', imageCounter);
    if (latexCounter > 0) {
      console.log('最终HTML包含LaTeX:', result.includes('data-type="latex-block"'));
    }
    if (imageCounter > 0) {
      console.log('最终HTML包含图片:', result.includes('data-type="markdown-image"'));
    }
  }

  return result
}

/**
 * HTML到Markdown转换 - 支持格式化标记
 */
export function convertHtmlToMarkdown(html: string) {
  if (!html) return ''

  // 使用DOM解析，递归处理所有格式化
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function processNode(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const children: string = Array.from(node.childNodes).map(processNode).join('')

      switch ((node as HTMLElement).tagName.toLowerCase()) {
        case 'h1':
          return `# ${children}`
        case 'h2':
          return `## ${children}`
        case 'h3':
          return `### ${children}`
        case 'h4':
          return `#### ${children}`
        case 'h5':
          return `##### ${children}`
        case 'h6':
          return `###### ${children}`
        case 'strong':
        case 'b':
          return `**${children}**`
        case 'em':
        case 'i':
          return `*${children}*`
        case 'code':
          return `\`${children}\``
        case 'blockquote':
          return `> ${children}`
        case 'li':
          return `- ${children}`
        case 'ul':
          return children
        case 'ol':
          return children
        case 'p':
          return children
        case 'br':
          return '\n'
        case 'table':
          const rows: string[] = [];
          const el = node as HTMLElement;
          Array.from(el.querySelectorAll('tr')).forEach((trEl: Element) => {
            const rowMarkdown = '| ' + Array.from(trEl.querySelectorAll('td, th')).map((cellEl: Element) => {
              return processNode(cellEl).trim();
            }).join(' | ') + ' |';
            rows.push(rowMarkdown);
          });
          if (rows.length === 0) return '';
          const colCount = rows[0].split('|').length - 2;
          const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
          rows.splice(1, 0, separator);
          return rows.join('\n');
        case 'tr':
          return Array.from(node.childNodes).map(processNode).join('');
        case 'td':
        case 'th':
          return Array.from(node.childNodes).map(processNode).join('');
        default:
          return children
      }
    }

    return ''
  }

  const result: string[] = []
  Array.from(doc.body.childNodes).forEach((node: ChildNode) => {
    const processed = processNode(node)
    if (processed.trim()) {
      result.push(processed)
    }
  })

  return result.join('\n\n')
}

/**
 * Helper function to convert HTML table to markdown
 */
export function convertTableToMarkdown(tableNode: HTMLElement) {
  const rows: string[] = [];
  Array.from(tableNode.querySelectorAll('tr')).forEach((tr: Element) => {
    const rowMarkdown = '| ' + Array.from(tr.querySelectorAll('td, th')).map((cell: Element) => {
      return (cell.textContent || '').trim();
    }).join(' | ') + ' |';
    rows.push(rowMarkdown);
  });
  if (rows.length === 0) return '';
  const colCount = rows[0].split('|').length - 2;
  const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
  rows.splice(1, 0, separator);
  return rows.join('\n');
}
