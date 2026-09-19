import type { TokenizerExtension } from 'marked';

/** A forward-only boundary scan shared by preview and task hierarchy parsing. */
export function readTableSource(source: string): { raw: string; complete: boolean } | undefined {
  if (!/^<table(?=[\s>])/i.test(source)) return undefined;
  let depth = 0;
  let position = 0;
  while (position < source.length) {
    const start = source.indexOf('<', position);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      if (end < 0) break;
      position = end + 3;
      continue;
    }
    let end = start + 1;
    let quote = '';
    for (; end < source.length; end++) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === source.length) break;
    const tag = source.slice(start, end + 1);
    const rawText = /^<(script|style|textarea|title)(?=[\s>])/i.exec(tag);
    if (rawText) {
      const closing = new RegExp(`</${rawText[1]}\\s*>`, 'gi');
      closing.lastIndex = end + 1;
      if (!closing.exec(source)) break;
      position = closing.lastIndex;
      continue;
    }
    if (/^<table(?=[\s>])/i.test(tag)) depth++;
    else if (/^<\/table\s*>$/i.test(tag) && --depth === 0)
      return { raw: source.slice(0, end + 1), complete: true };
    position = end + 1;
  }
  return { raw: source, complete: false };
}

export const tableSourceTokenizer: TokenizerExtension = {
  name: 'notebookHtmlTable',
  level: 'block',
  tokenizer(text) {
    const table = readTableSource(text);
    if (table) return { type: 'notebookHtmlTable', ...table };
  },
};
