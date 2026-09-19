import type { Plugin } from 'unified';
import type { CompileContext, Extension } from 'mdast-util-from-markdown';

type CodeNode = Extract<CompileContext['stack'][number], { type: 'code' }>;

/** Use parser fence events, including container nesting, rather than reparse raw Markdown. */
export const remarkCompleteMermaid: Plugin = function () {
  const opened = new WeakSet<object>();
  const closed: CodeNode[] = [];
  const extension: Extension = {
    enter: {
      codeFencedFence() {
        // The compiler buffers code in a fragment above its owning code node.
        for (let index = this.stack.length - 1; index >= 0; index--) {
          const node = this.stack[index];
          if (node.type !== 'code') continue;
          if (opened.has(node)) closed.push(node);
          else opened.add(node);
          break;
        }
      },
    },
    transforms: [
      () => {
        for (const node of closed) {
          if (node.lang?.toLowerCase() !== 'mermaid') continue;
          node.data = {
            ...node.data,
            hProperties: {
              ...node.data?.hProperties,
              dataMermaidSource: node.value,
            },
          };
        }
        closed.length = 0;
      },
    ],
  };
  const data = this.data() as { fromMarkdownExtensions?: Array<Extension | Extension[]> };
  (data.fromMarkdownExtensions ??= []).push(extension);
};
