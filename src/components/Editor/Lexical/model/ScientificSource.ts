import type { MdastNode } from '@lexical/mdast';
import { parseScientificMarkdown } from './ScientificMarkdownSyntax';

export type ScientificSyntax = 'math' | 'inlineMath' | 'notebookLatex';
export type ScientificData = {
  syntax: ScientificSyntax;
  value: string;
  display: boolean;
  meta?: string | null;
  lang?: string;
  /** Authored text, including fences/delimiters. Preview is only a projection. */
  source?: string;
};

export function scientificSource(data: ScientificData): string {
  if (data.source !== undefined) return data.source;
  switch (data.syntax) {
    case 'math':
      return '$$' + (data.meta ? ' ' + data.meta : '') + '\n' + data.value + '\n$$';
    case 'inlineMath':
      return '$' + data.value + '$';
    case 'notebookLatex':
      return data.display ? '\\[' + data.value + '\\]' : '\\(' + data.value + '\\)';
  }
}

export function scientificDataFromAst(node: MdastNode, source: string): ScientificData {
  const ast = node as MdastNode & {
    value: string;
    display?: boolean;
    meta?: string | null;
    lang?: string;
    source?: string;
  };
  let literal = ast.source;
  const start = node.position?.start.offset,
    end = node.position?.end.offset;
  if (literal === undefined && source && start !== undefined && end !== undefined) {
    literal = source.slice(start, end);
    // Container prefixes belong to the surrounding Markdown, not the formula.
    // The exporter will reapply the quote/list indentation to this literal.
    if (node.type === 'math') {
      const indent = (node.position?.start.column || 1) - 1;
      if (indent)
        literal = literal
          .split('\n')
          .map((line, i) => (i ? line.replace(new RegExp(`^[ >\\t]{0,${indent}}`), '') : line))
          .join('\n');
    }
  }
  // Final blank lines have no separate AST node. Keep them with the last
  // scientific source so reloading does not silently delete unfinished lines.
  if (literal !== undefined && end !== undefined && /^[\r\n]+$/.test(source.slice(end)))
    literal += source.slice(end);
  return {
    syntax: node.type === 'notebookLatexDraft' ? 'notebookLatex' : (node.type as ScientificSyntax),
    value: ast.value,
    display: node.type === 'math' || !!ast.display,
    meta: ast.meta,
    lang: ast.lang,
    ...(literal === undefined ? {} : { source: literal }),
  };
}

/** No repair/normalization: an incomplete source simply has no preview yet. */
export function scientificPreview(source: string): ScientificData | null {
  const tree = parseScientificMarkdown(source);
  if (tree.children.length !== 1) return null;
  const block = tree.children[0];
  const node =
    block.type === 'paragraph' && block.children.length === 1 ? block.children[0] : block;
  if (!['math', 'inlineMath', 'notebookLatex'].includes(node.type)) return null;
  const data = scientificDataFromAst(node as MdastNode, source);
  const syntax = source.trimEnd(); // validation only; authored source is never trimmed
  if (node.type === 'notebookLatex') {
    const slashes = syntax.slice(0, -1).match(/\\+$/)?.[0].length || 0;
    if (!syntax.endsWith(data.display ? ']' : ')') || slashes % 2 !== 1) return null;
  }
  if (node.type === 'math') {
    const opener = syntax.match(/^(\${2,}|`{3,}|~{3,})[^\r\n]*\r?\n/);
    if (!opener) return null;
    const last = syntax.split(/\r?\n/).slice(-1)[0];
    const marker = opener[1][0].replace(/[$]/g, '\\$');
    if (!new RegExp(`^${marker}{${opener[1].length},}[ \\t]*$`).test(last)) return null;
  }
  return data;
}
