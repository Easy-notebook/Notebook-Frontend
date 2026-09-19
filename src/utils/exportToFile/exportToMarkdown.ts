import { saveAs } from 'file-saver';
import type { Cell, OutputItem } from '@Store/models';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { formatCodeFence } from '@Utils/markdown/fencedMarkdown';

function formatOutput(output: OutputItem): string {
  const text = String(output.content ?? '');
  if (output.type === 'image') return `![Output](${text})`;
  const label = output.type === 'error' ? '❌ Error:' : 'Output:';
  return `\n${label}\n${formatCodeFence(text, '')}\n`;
}

/** Export the source model, never mounted editor DOM or derived preview caches. */
export function notebookToMarkdown(cells: readonly Cell[], date = new Date()): string {
  let code = 0;
  let markdown = 0;
  const sections = cells.map((cell) => {
    if (cell.type === 'code' || cell.type === 'hybrid') {
      code++;
      const source = cell.type === 'code'
        ? formatCodeFence(cell.content || '', normalizeCodeLanguage(cell.language))
        : cell.content || '';
      return `${source}\n${(cell.outputs || []).map(formatOutput).join('\n')}`;
    }
    if (cell.type === 'markdown') markdown++;
    if (cell.type === 'raw') return formatCodeFence(cell.content || '', 'text');
    if (cell.type === 'thinking' && !cell.content) {
      return (cell.textArray || []).join('\n') || cell.customText || '';
    }
    return cell.content || '';
  });
  return `---
title: Exported Notebook
date: ${date.toISOString().split('T')[0]}
cells:
  total: ${cells.length}
  code: ${code}
  markdown: ${markdown}
---

${sections.join('\n\n---\n\n')}`;
}

export function exportToMarkdown(cells: Cell[], filename = 'notebook.md'): void {
  const blob = new Blob([notebookToMarkdown(cells)], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, filename);
}
