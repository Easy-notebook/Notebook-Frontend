import React from 'react';
import { BubbleMenu, Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
} from 'lucide-react';

interface EditorBubbleMenuProps {
  editor: Editor | null;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({ editor }) => {
  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      className="flex items-center gap-1 p-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
    >
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('bold') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Bold"
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('italic') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Italic"
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('strike') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Strike"
      >
        <Strikethrough size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('code') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Code"
      >
        <Code size={16} />
      </button>

      <div className="w-px h-4 bg-gray-200 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('heading', { level: 1 }) ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('heading', { level: 2 }) ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </button>

      <div className="w-px h-4 bg-gray-200 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('bulletList') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Bullet List"
      >
        <List size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('orderedList') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Ordered List"
      >
        <ListOrdered size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
          editor.isActive('blockquote') ? 'text-blue-600 bg-blue-50' : 'text-gray-600'
        }`}
        title="Quote"
      >
        <Quote size={16} />
      </button>
    </BubbleMenu>
  );
};
