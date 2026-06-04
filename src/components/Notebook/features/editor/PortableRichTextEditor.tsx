import React, { useCallback, useEffect, useRef } from 'react';
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from 'lucide-react';

interface PortableRichTextEditorProps {
  className?: string;
  onChange: (html: string) => void;
  style?: React.CSSProperties;
  value: string;
}

type EditorCommand = {
  command: string;
  icon: React.ElementType;
  label: string;
  value?: string;
};

const editorCommands: EditorCommand[] = [
  { command: 'formatBlock', icon: Heading1, label: 'Heading 1', value: 'h1' },
  { command: 'formatBlock', icon: Heading2, label: 'Heading 2', value: 'h2' },
  { command: 'bold', icon: Bold, label: 'Bold' },
  { command: 'italic', icon: Italic, label: 'Italic' },
  { command: 'underline', icon: Underline, label: 'Underline' },
  { command: 'insertOrderedList', icon: ListOrdered, label: 'Ordered list' },
  { command: 'insertUnorderedList', icon: List, label: 'Bullet list' },
  { command: 'removeFormat', icon: RemoveFormatting, label: 'Clear formatting' },
];

export const PortableRichTextEditor: React.FC<PortableRichTextEditorProps> = ({
  className,
  onChange,
  style,
  value,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || editor.innerHTML === value) return;
    editor.innerHTML = value;
  }, [value]);

  const emitChange = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  const runCommand = useCallback(
    (command: string, commandValue?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, commandValue);
      emitChange();
    },
    [emitChange]
  );

  const createLink = useCallback(() => {
    const href = window.prompt('Enter link URL');
    if (!href) return;
    runCommand('createLink', href);
  }, [runCommand]);

  return (
    <div className={className} style={style}>
      <div className="ql-toolbar ql-snow flex h-[42px] flex-wrap items-center gap-1 border border-gray-200 bg-white px-2 dark:border-gray-700 dark:bg-gray-800">
        {editorCommands.map(({ command, icon: Icon, label, value: commandValue }) => (
          <button
            key={`${command}-${commandValue ?? 'default'}`}
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-500 dark:text-gray-400 dark:hover:bg-gray-700"
            title={label}
            aria-label={label}
            onClick={() => runCommand(command, commandValue)}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-500 dark:text-gray-400 dark:hover:bg-gray-700"
          title="Link"
          aria-label="Link"
          onClick={createLink}
        >
          <Link className="h-4 w-4" />
        </button>
      </div>
      <div className="ql-container ql-snow h-[calc(100%-42px)] border border-t-0 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div
          ref={editorRef}
          className="ql-editor prose max-w-none p-3 text-gray-900 outline-none dark:prose-invert dark:text-gray-200"
          contentEditable
          role="textbox"
          aria-multiline="true"
          onInput={emitChange}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
};
