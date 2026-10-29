import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from '@lexical/list';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
} from 'lucide-react';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { $createParagraphNode } from 'lexical';
import { $readTableToolbarState } from '../interaction/TableEditingController';
import { $cellAncestor } from '../model/NotebookDocument';

export function FormattingPlugin() {
  const [editor] = useLexicalComposerContext();
  const readOnly = useEditorReadOnly();
  const toolbar = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ left: number; top: number; active: string[] } | null>(null);
  useEffect(() => {
    const update = () =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const dom = window.getSelection();
        if (
          !editor.isEditable() ||
          !$isRangeSelection(selection) ||
          selection.isCollapsed() ||
          !!$readTableToolbarState() ||
          !dom?.rangeCount ||
          !editor.getRootElement()?.contains(dom.anchorNode) ||
          (!editor.getRootElement()?.contains(document.activeElement) &&
            !toolbar.current?.contains(document.activeElement))
        ) {
          setState(null);
          return;
        }
        const rect = dom.getRangeAt(0).getBoundingClientRect();
        const active = ['bold', 'italic', 'underline', 'strikethrough', 'code'].filter((format) =>
          selection.hasFormat(format as TextFormatType)
        );
        let parent = selection.anchor.getNode().getParent();
        while (parent) {
          if ($isHeadingNode(parent)) active.push(parent.getTag());
          if ($isListNode(parent)) active.push(parent.getListType());
          if ($isQuoteNode(parent)) active.push('quote');
          parent = parent.getParent();
        }
        setState({
          left: rect.left + rect.width / 2,
          top: Math.max(8, rect.top - 42),
          active,
        });
      });
    const unregister = editor.registerUpdateListener(update);
    document.addEventListener('selectionchange', update);
    document.addEventListener('focusin', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      unregister();
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('focusin', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor]);
  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element || !state) return;
    const width = element.getBoundingClientRect().width;
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, state.left - width / 2))}px`;
  }, [state]);
  if (readOnly || !state) return null;
  const block = (kind: string) =>
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (
        $cellAncestor(selection.anchor.getNode())?.getType() === 'notebook-cell' &&
        (
          $cellAncestor(
            selection.anchor.getNode()
          ) as import('../model/NotebookCellNode').NotebookCellNode
        ).isTitle()
      )
        return;
      $setBlocksType(selection, () =>
        state.active.includes(kind)
          ? $createParagraphNode()
          : kind === 'quote'
            ? $createQuoteNode()
            : $createHeadingNode(kind as 'h1' | 'h2')
      );
    });
  const list = (kind: 'bullet' | 'number') => {
    const title = editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      const cell = $cellAncestor(selection.anchor.getNode());
      return (
        cell?.getType() === 'notebook-cell' &&
        (cell as import('../model/NotebookCellNode').NotebookCellNode).isTitle()
      );
    });
    if (title) return;
    editor.dispatchCommand(
      state.active.includes(kind)
        ? REMOVE_LIST_COMMAND
        : kind === 'bullet'
          ? INSERT_UNORDERED_LIST_COMMAND
          : INSERT_ORDERED_LIST_COMMAND,
      undefined
    );
  };
  const items = [
    {
      id: 'bold',
      title: 'Bold',
      Icon: Bold,
      run: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
    },
    {
      id: 'italic',
      title: 'Italic',
      Icon: Italic,
      run: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
    },
    {
      id: 'underline',
      title: 'Underline',
      Icon: Underline,
      run: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'),
    },
    {
      id: 'strikethrough',
      title: 'Strike',
      Icon: Strikethrough,
      run: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'),
    },
    {
      id: 'code',
      title: 'Code',
      Icon: Code,
      run: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'),
    },
    { id: 'h1', title: 'Heading 1', Icon: Heading1, run: () => block('h1') },
    { id: 'h2', title: 'Heading 2', Icon: Heading2, run: () => block('h2') },
    { id: 'bullet', title: 'Bullet List', Icon: List, run: () => list('bullet') },
    { id: 'number', title: 'Ordered List', Icon: ListOrdered, run: () => list('number') },
    { id: 'quote', title: 'Quote', Icon: Quote, run: () => block('quote') },
  ];
  return createPortal(
    <div
      ref={toolbar}
      role="toolbar"
      aria-label="Text formatting"
      className="notebook-format-toolbar"
      style={{ left: state.left, top: state.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map(({ id, title, Icon, run }, index) => (
        <span key={id} className="flex items-center">
          {(index === 5 || index === 7) && <span className="w-px h-4 bg-gray-200 mx-1" />}
          <button
            type="button"
            title={title}
            aria-pressed={state.active.includes(id)}
            onClick={() => {
              if (editor.isEditable()) run();
            }}
            aria-label={title}
          >
            <Icon size={16} />
          </button>
        </span>
      ))}
    </div>,
    document.body
  );
}
