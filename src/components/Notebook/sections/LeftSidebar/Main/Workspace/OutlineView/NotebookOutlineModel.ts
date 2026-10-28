import { isNotebookTitleCell } from '@Editor/utils/documentTitle';
import type { Cell } from '@Store/models';
import { createMarkdownParser } from '@Editor/utils/inlineMarkdown';
import type { Token, Tokens } from 'marked';

export interface NotebookHeading {
  key: string;
  cellId: string;
  phaseId?: string;
  stepId?: string;
  ordinal: number;
  level: number;
  title: string;
  number: string;
  depth: number;
  parent?: string;
  isTitle: boolean;
}

function inlineText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'html') return '';
      if ('tokens' in token && token.tokens) return inlineText(token.tokens);
      return 'text' in token ? String(token.text) : '';
    })
    .join('');
}

/** Outline is a projection of authored cells, never of task heuristics or generated output. */
export class NotebookOutlineModel {
  static project(cells: readonly Cell[]): NotebookHeading[] {
    const result: NotebookHeading[] = [];
    const stack: NotebookHeading[] = [];
    const siblingCounts = new Map<string, number>();
    const parser = createMarkdownParser();
    cells.forEach((cell, cellIndex) => {
      if (cell.type !== 'markdown') return;
      let ordinal = 0;
      const visit = (tokens: Token[]) => {
        for (const token of tokens) {
          if (token.type === 'heading') {
            const heading = token as Tokens.Heading;
            const isTitle = cellIndex === 0 && ordinal === 0 && isNotebookTitleCell(cell);
            while (stack.length && stack[stack.length - 1].level >= heading.depth) stack.pop();
            const parent = stack[stack.length - 1];
            const parentKey = parent?.key ?? '';
            const count = (siblingCounts.get(parentKey) ?? 0) + 1;
            if (!isTitle) siblingCounts.set(parentKey, count);
            const entry: NotebookHeading = {
              key: `${cell.id}:${ordinal}`,
              cellId: cell.id,
              phaseId: cell.phaseId ?? undefined,
              stepId: cell.stepId ?? undefined,
              ordinal: ordinal++,
              level: heading.depth,
              title: inlineText(heading.tokens).trim() || 'Untitled section',
              number: isTitle
                ? ''
                : parent && !parent.isTitle
                  ? `${parent.number}.${count}`
                  : `${count}`,
              depth: parent ? parent.depth + (parent.isTitle ? 0 : 1) : 0,
              parent: parent?.key,
              isTitle,
            };
            result.push(entry);
            stack.push(entry);
          } else if (token.type === 'blockquote') visit((token as Tokens.Blockquote).tokens);
          else if (token.type === 'list') {
            for (const item of (token as Tokens.List).items) visit(item.tokens);
          }
        }
      };
      visit(parser.lexer(cell.content));
    });
    return result;
  }

  static visible(headings: readonly NotebookHeading[], collapsed: ReadonlySet<string>) {
    const hidden = new Set<string>();
    return headings.filter((heading) => {
      if (heading.parent && (collapsed.has(heading.parent) || hidden.has(heading.parent))) {
        hidden.add(heading.key);
        return false;
      }
      return true;
    });
  }
}
