import { $isHeadingNode } from '@lexical/rich-text';
import { PersistentBlockNode, $createPersistentBlock } from './PersistentBlockNode';
import {
  $createParagraphNode,
  $isElementNode,
  RootNode,
  ElementNode,
  configExtension,
  defineExtension,
} from 'lexical';
import { MdastImportExtension, type MdastNode } from '@lexical/mdast';
import { blockFromMarkdown, blockToMarkdown, type PersistentBlockAst } from './BlockMarkdown';
import { newBlockMetadata } from './BlockMetadata';
export const PersistentBlockExtension = defineExtension({
  name: 'notebook/persistent-blocks',
  nodes: [PersistentBlockNode],
  register(editor) {
    return editor.registerNodeTransform(RootNode, (root) => {
      const ids = new Set<string>();
      const visit = (parent: ElementNode) => {
        for (const node of parent.getChildren()) {
          if (node instanceof PersistentBlockNode) {
            if (ids.has(node.metadata().id))
              node.setMetadata({ ...node.metadata(), id: newBlockMetadata().id });
            ids.add(node.metadata().id);
            if (
              node.metadata().kind === 'toggle-heading' &&
              !$isHeadingNode(node.getFirstChild())
            ) {
              // Removing/converting the heading ends section folding without removing content.
              node.setMetadata({ ...node.metadata(), kind: 'group', collapsed: false });
            }
          }
          if ($isElementNode(node)) visit(node);
        }
      };
      visit(root);
    });
  },
  dependencies: [
    configExtension(MdastImportExtension, {
      mdastExtensions: [blockFromMarkdown],
      toMarkdownExtensions: [blockToMarkdown],
      importRules: [
        {
          type: 'notebookBlock',
          $import: (node, context) => {
            const ast = node as PersistentBlockAst;
            const children = context.importChildren(ast);
            return $createPersistentBlock(ast.metadata).append(
              ...(children.length ? children : [$createParagraphNode()])
            );
          },
        },
      ],
      exportRules: [
        {
          type: 'persistent-block',
          $export: (node, context) =>
            node instanceof PersistentBlockNode
              ? ({
                  type: 'notebookBlock',
                  metadata: node.metadata(),
                  children: context.exportChildren(node),
                } as MdastNode)
              : null,
        },
      ],
    }),
  ],
});
