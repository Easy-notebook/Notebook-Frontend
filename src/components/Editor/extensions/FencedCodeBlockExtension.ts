import { Node, mergeAttributes } from '@tiptap/core';

/** Non-executable code nested inside a Markdown cell; no extra store identity or CodeMirror. */
export const FencedCodeBlockExtension = Node.create({
  name: 'fencedCodeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes() {
    return {
      language: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-language'),
        renderHTML: (attrs) => ({ 'data-language': attrs.language }),
      },
      source: {
        default: '',
        parseHTML: (element) => decodeURIComponent(element.getAttribute('data-source') || ''),
        renderHTML: (attrs) => ({ 'data-source': encodeURIComponent(attrs.source) }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'pre[data-type="fenced-code-block"]',
        preserveWhitespace: 'full',
        contentElement: 'code',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, { 'data-type': 'fenced-code-block' }),
      ['code', 0],
    ];
  },
});
