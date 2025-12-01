/**
 * TipTap Editor Extensions Configuration
 * Centralizes all extension setup for the TiptapNotebookEditor
 */

import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import Heading from '@tiptap/extension-heading';
import { Extension as CoreExtension, InputRule } from '@tiptap/core';
import {
  CodeBlockExtension,
  ThinkingCellExtension,
  TableExtension as SimpleTableExtension,
  ImageExtension,
  LaTeXExtension,
  RawCellExtension,
  UploadDropExtension,
  FileAttachmentExtension,
  TitleExtension,
} from '@Editor/extensions';

/**
 * WikiLink Input Rule Extension
 * Converts [[wikilink]] and [[target|label]] syntax to proper links
 */
export const WikiLinkInput = CoreExtension.create({
  name: 'wikiLinkInput',
  addInputRules() {
    const find = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
    function resolveHref(target: string) {
      const t = target.trim();
      if (/^(https?:\/\/|mailto:|file:\/\/)/i.test(t)) return t;
      if (/^(\/|\.\/|\.\.\/)/.test(t)) return t; // 相对/绝对路径（由前端资源或宿主处理）
      return t; // 其他情况按相对路径处理
    }
    return [
      new InputRule({
        find,
        handler: ({ range, match, chain }) => {
          const target = (match?.[1] ?? '').trim();
          const label = (match?.[2] ?? target).trim();
          const href = resolveHref(target);
          chain().deleteRange(range).insertContent(label).setLink({ href }).run();
        },
      }),
    ];
  },
});

/**
 * Get configured TipTap extensions
 */
export function getTipTapExtensions(placeholder: string) {
  return [
    // Core functionality
    StarterKit.configure({
      document: false, // Disable default Document to use custom one
      codeBlock: false,
      heading: false,
      bulletList: { keepMarks: true, keepAttributes: false },
      orderedList: { keepMarks: true, keepAttributes: false },
    }),

    // Custom Document to enforce Title at the top
    Document.extend({
      content: 'title block+',
    }),

    // Link support with file:// protocol
    Link.configure({
      autolink: true,
      openOnClick: false,
      linkOnPaste: true,
      protocols: ['http', 'https', 'mailto', { scheme: 'file', optionalSlashes: true }],
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),

    // WikiLink input rules
    WikiLinkInput,

    // Custom cell extensions
    CodeBlockExtension,
    ThinkingCellExtension,
    FileAttachmentExtension,
    TitleExtension,

    // Custom Heading extension with ID preservation (Levels 2-6)
    Heading.configure({ levels: [2, 3, 4, 5, 6], HTMLAttributes: {} }).extend({
      parseHTML() {
        return [
          { tag: 'h2', getAttrs: (node) => ({ level: 2, id: node.getAttribute('id') }) },
          { tag: 'h3', getAttrs: (node) => ({ level: 3, id: node.getAttribute('id') }) },
          { tag: 'h4', getAttrs: (node) => ({ level: 4, id: node.getAttribute('id') }) },
          { tag: 'h5', getAttrs: (node) => ({ level: 5, id: node.getAttribute('id') }) },
          { tag: 'h6', getAttrs: (node) => ({ level: 6, id: node.getAttribute('id') }) },
        ];
      },
      renderHTML({ node, HTMLAttributes }) {
        const hasLevel = this.options.levels.includes(node.attrs.level);
        const level = hasLevel ? node.attrs.level : this.options.levels[0];
        const attrs = { ...HTMLAttributes };
        if (node.attrs.id) attrs.id = node.attrs.id;
        return [`h${level}`, attrs, 0];
      },
      addAttributes() {
        return {
          ...this.parent?.(),
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('id'),
            renderHTML: (attributes) => (attributes.id ? { id: attributes.id } : {}),
          },
        };
      },
    }),

    // Media extensions
    ImageExtension,
    LaTeXExtension,
    RawCellExtension,
    UploadDropExtension,

    // Placeholder
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'title') {
          return placeholder;
        }
        return 'Type / for commands...';
      },
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),

    // Table support
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    SimpleTableExtension,
  ];
}
