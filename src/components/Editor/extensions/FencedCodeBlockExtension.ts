import { Node, mergeAttributes } from '@tiptap/core';
import { breakNestedCodeFence } from '../TipTap/model/sourceCellTransitions';

/** Non-executable code nested inside a Markdown cell; no extra store identity or CodeMirror. */
export const FencedCodeBlockExtension = Node.create({
  name: 'fencedCodeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        if (!this.editor.isActive(this.name)) return false;
        if (!this.editor.isEditable) return true;
        return breakNestedCodeFence(this.editor);
      },
      Enter: () => {
        if (!this.editor.isActive(this.name)) return false;
        if (!this.editor.isEditable) return true;
        // Code lines belong to one block, not new notebook cells or paragraphs.
        return this.editor.commands.insertContent('\n');
      },
      'Mod-Enter': () => {
        if (!this.editor.isActive(this.name)) return false;
        if (!this.editor.isEditable) return true;
        return this.editor.commands.exitCode();
      },
    };
  },
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
