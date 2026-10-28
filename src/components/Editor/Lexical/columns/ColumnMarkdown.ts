import type { Extension } from 'mdast-util-from-markdown';
import type { Options } from 'mdast-util-to-markdown';
import type { Parent, RootContent } from 'mdast';
import { parseColumnMetadata, type ColumnMetadata } from './ColumnModel';
export interface ColumnsAst extends Parent {
  type: 'notebookColumns';
  metadata: ColumnMetadata;
  children: ColumnAst[];
}
export interface ColumnAst extends Parent {
  type: 'notebookColumn';
  children: RootContent[];
}
declare module 'mdast' {
  interface RootContentMap {
    notebookColumns: ColumnsAst;
    notebookColumn: ColumnAst;
  }
  interface BlockContentMap {
    notebookColumns: ColumnsAst;
    notebookColumn: ColumnAst;
  }
}
const raw = (node: RootContent) => (node.type === 'html' ? node.value.trim() : '');
function closing(children: RootContent[], start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start + 1; index < children.length; index++) {
    const value = raw(children[index]);
    if (value.startsWith(open)) depth++;
    if (value === close) {
      if (!depth) return index;
      depth--;
    }
  }
  throw Error('Unclosed column layout');
}
export const columnsFromMarkdown: Extension = {
  transforms: [
    (tree) => {
      const visit = (parent: Parent) => {
        const children = parent.children as RootContent[];
        for (let index = 0; index < children.length; index++) {
          const node = children[index];
          const value = raw(node);
          const match = /^<!-- notebook:columns (\{.*\}) -->$/s.exec(value);
          if (match) {
            const metadata = parseColumnMetadata(JSON.parse(match[1]));
            const end = closing(
              children,
              index,
              '<!-- notebook:columns ',
              '<!-- /notebook:columns -->'
            );
            const layout: ColumnsAst = {
              type: 'notebookColumns',
              metadata,
              children: [],
              position: { start: node.position!.start, end: children[end].position!.end },
            };
            const inner = children.slice(index + 1, end);
            for (let at = 0; at < inner.length; at++) {
              if (raw(inner[at]) !== '<!-- notebook:column -->')
                throw Error('Column layouts may only contain columns');
              const last = closing(
                inner,
                at,
                '<!-- notebook:column -->',
                '<!-- /notebook:column -->'
              );
              const column: ColumnAst = {
                type: 'notebookColumn',
                children: inner.slice(at + 1, last),
                position: { start: inner[at].position!.start, end: inner[last].position!.end },
              };
              visit(column);
              layout.children.push(column);
              at = last;
            }
            if (layout.children.length !== metadata.widths.length)
              throw Error('Column count does not match its widths');
            children.splice(index, end - index + 1, layout);
          } else if (/^<!-- \/?notebook:columns?\b/.test(value))
            throw Error('Unexpected column marker');
          else if ('children' in node) visit(node);
        }
      };
      visit(tree);
    },
  ],
};
export const columnsToMarkdown: Options = {
  handlers: {
    notebookColumns: (node, _parent, context, info) =>
      '<!-- notebook:columns ' +
      JSON.stringify((node as ColumnsAst).metadata) +
      ' -->\n\n' +
      context.containerFlow(node as ColumnsAst, info) +
      '\n\n<!-- /notebook:columns -->',
    notebookColumn: (node, _parent, context, info) =>
      '<!-- notebook:column -->\n\n' +
      context.containerFlow(node as ColumnAst, info) +
      '\n\n<!-- /notebook:column -->',
  },
};
