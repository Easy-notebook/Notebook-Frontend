import { renderNotebookMarkdown } from './notebookMarkdownParser';

export function convertMarkdownToHtml(
  markdown: string,
  cell: { id?: string; phaseId?: string } | null = null,
  headingSlugCounter: Map<string, Map<string, number>> | null = null
): string {
  return markdown ? renderNotebookMarkdown(markdown, cell, headingSlugCounter) : '<p></p>';
}

/**
 * HTML到Markdown转换 - 支持格式化标记
 */
export function convertHtmlToMarkdown(html: string) {
  if (!html) return '';

  // 使用DOM解析，递归处理所有格式化
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function processNode(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const children: string = Array.from(node.childNodes).map(processNode).join('');

      switch ((node as HTMLElement).tagName.toLowerCase()) {
        case 'h1':
          return `# ${children}`;
        case 'h2':
          return `## ${children}`;
        case 'h3':
          return `### ${children}`;
        case 'h4':
          return `#### ${children}`;
        case 'h5':
          return `##### ${children}`;
        case 'h6':
          return `###### ${children}`;
        case 'strong':
        case 'b':
          return `**${children}**`;
        case 'em':
        case 'i':
          return `*${children}*`;
        case 'code':
          return `\`${children}\``;
        case 'blockquote':
          return `> ${children}`;
        case 'li':
          return `- ${children}`;
        case 'ul':
          return children;
        case 'ol':
          return children;
        case 'p':
          return children;
        case 'br':
          return '\n';
        case 'table': {
          const rows: string[] = [];
          const el = node as HTMLElement;
          Array.from(el.querySelectorAll('tr')).forEach((trEl: Element) => {
            const rowMarkdown =
              '| ' +
              Array.from(trEl.querySelectorAll('td, th'))
                .map((cellEl: Element) => {
                  return processNode(cellEl).trim();
                })
                .join(' | ') +
              ' |';
            rows.push(rowMarkdown);
          });
          if (rows.length === 0) return '';
          const colCount = rows[0].split('|').length - 2;
          const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
          rows.splice(1, 0, separator);
          return rows.join('\n');
        }
        case 'tr':
          return Array.from(node.childNodes).map(processNode).join('');
        case 'td':
        case 'th':
          return Array.from(node.childNodes).map(processNode).join('');
        default:
          return children;
      }
    }

    return '';
  }

  const result: string[] = [];
  Array.from(doc.body.childNodes).forEach((node: ChildNode) => {
    const processed = processNode(node);
    if (processed.trim()) {
      result.push(processed);
    }
  });

  return result.join('\n\n');
}

/**
 * Helper function to convert HTML table to markdown
 */
export function convertTableToMarkdown(tableNode: HTMLElement) {
  const rows: string[] = [];
  Array.from(tableNode.querySelectorAll('tr')).forEach((tr: Element) => {
    const rowMarkdown =
      '| ' +
      Array.from(tr.querySelectorAll('td, th'))
        .map((cell: Element) => {
          return (cell.textContent || '').trim();
        })
        .join(' | ') +
      ' |';
    rows.push(rowMarkdown);
  });
  if (rows.length === 0) return '';
  const colCount = rows[0].split('|').length - 2;
  const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
  rows.splice(1, 0, separator);
  return rows.join('\n');
}
