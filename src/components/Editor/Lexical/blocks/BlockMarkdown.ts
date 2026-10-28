import type { Extension } from 'mdast-util-from-markdown';
import type { Options } from 'mdast-util-to-markdown';
import type { Parent, RootContent } from 'mdast';
import { blockOpener, blockCloser, parseBlockMetadata, type BlockMetadata } from './BlockMetadata';
export interface PersistentBlockAst extends Parent {
  type: 'notebookBlock';
  metadata: BlockMetadata;
  children: RootContent[];
}
declare module 'mdast' {
  interface RootContentMap {
    notebookBlock: PersistentBlockAst;
  }
  interface BlockContentMap {
    notebookBlock: PersistentBlockAst;
  }
}
function marker(node: RootContent): string | null {
  return node.type === 'html' ? node.value.trim() : null;
}
export const blockFromMarkdown: Extension = {
  transforms: [
    (tree) => {
      const ids = new Set<string>();
      const visit = (parent: Parent) => {
        const children = parent.children as RootContent[];
        for (let index = 0; index < children.length; index++) {
          const node = children[index];
          const raw = marker(node);
          const opening = raw?.match(/^<!-- notebook:block (\{.*\}) -->$/s);
          if (opening) {
            const metadata = parseBlockMetadata(JSON.parse(opening[1]));
            if (ids.has(metadata.id)) throw Error('Duplicate block identity: ' + metadata.id);
            ids.add(metadata.id);
            const end = children.findIndex(
              (candidate, offset) =>
                offset > index && marker(candidate) === blockCloser(metadata.id)
            );
            if (end < 0) throw Error('Unclosed persistent block: ' + metadata.id);
            const block: PersistentBlockAst = {
              type: 'notebookBlock',
              metadata,
              children: children.slice(index + 1, end),
              position: { start: node.position!.start, end: children[end].position!.end },
            };
            visit(block);
            if (metadata.kind === 'toggle-heading' && block.children[0]?.type !== 'heading')
              throw Error('A toggle heading must start with a Markdown heading');
            children.splice(index, end - index + 1, block);
          } else if (raw?.startsWith('<!-- /notebook:block '))
            throw Error('Unexpected persistent block closing marker');
          else if ('children' in node) visit(node as Parent);
        }
      };
      visit(tree);
    },
  ],
};
export const blockToMarkdown: Options = {
  handlers: {
    notebookBlock: (node, _parent, context, info) => {
      const block = node as PersistentBlockAst;
      return (
        blockOpener(block.metadata) +
        '\n\n' +
        context.containerFlow(block, info) +
        '\n\n' +
        blockCloser(block.metadata.id)
      );
    },
  },
};
