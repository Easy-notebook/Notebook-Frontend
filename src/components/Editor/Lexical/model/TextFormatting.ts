import { $isTextNode, defineExtension, configExtension } from 'lexical';
import { MdastImportExtension, type MdastNode } from '@lexical/mdast';
/** Boundary spaces stay outside emphasis; literal code keeps its exact padding. */
export const TextFormattingExtension = defineExtension({
  name: 'notebook/text-formatting',
  dependencies: [
    configExtension(MdastImportExtension, {
      exportRules: [
        {
          type: 'text',
          $export: (node) => {
            if (
              !$isTextNode(node) ||
              node.hasFormat('code') ||
              !['bold', 'italic', 'strikethrough'].some((format) =>
                node.hasFormat(format as 'bold' | 'italic' | 'strikethrough')
              )
            )
              return null;
            const value = node.getTextContent();
            const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)!;
            if (!match[1] && !match[3]) return null;
            if (!value.trim()) return { type: 'text', value };
            let content: MdastNode = { type: 'text', value: match[2] };
            if (node.hasFormat('italic'))
              content = { type: 'emphasis', children: [content] } as MdastNode;
            if (node.hasFormat('bold'))
              content = { type: 'strong', children: [content] } as MdastNode;
            if (node.hasFormat('strikethrough'))
              content = { type: 'delete', children: [content] } as MdastNode;
            return [
              ...(match[1] ? [{ type: 'text', value: match[1] }] : []),
              content,
              ...(match[3] ? [{ type: 'text', value: match[3] }] : []),
            ] as MdastNode[];
          },
        },
      ],
    }),
  ],
});
