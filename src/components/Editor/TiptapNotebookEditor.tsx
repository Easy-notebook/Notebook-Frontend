/**
 * TipTap Notebook Editor - Refactored
 * A rich-text editor for hybrid notebooks supporting markdown, code, and special cells
 */

import { useRef, forwardRef, useImperativeHandle, useMemo, useState, useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import useStore from '@Store/notebookStore';
import type { Cell } from '@Store/models';
import { convertCellsToHtml } from './utils/cellConverters';
import '@Utils/logger'; // Initialize debug tools

// Hooks
import { useCellManagement } from './TipTap/hooks/useCellManagement';
import { useEditorEvents } from './TipTap/hooks/useEditorEvents';
import { useEditorSync } from './TipTap/hooks/useEditorSync';
import { useKeyboardHandlers } from './TipTap/hooks/useKeyboardHandlers';
import { useLinkHandler } from './TipTap/hooks/useLinkHandler';
import { useBeforeUnload } from './TipTap/hooks/useBeforeUnload';
import { useTranslation } from 'react-i18next';

// Config
import { getTipTapExtensions } from './TipTap/config/extensions';
import {
  CursorStyleExtension,
  TrailingParagraphExtension,
  EnhancedCursorPositionExtension,
} from './TipTap/config/editorPlugins';

// Components
import SimpleDragManager from './TipTap/BlockManager/SimpleDragManager';
import TipTapSlashCommands from './TipTap/TipTapSlashCommands';
import { useTipTapSlashCommands } from './TipTap/useTipTapSlashCommands';
import { EditorBubbleMenu } from './TipTap/components/BubbleMenu';
import { EditorCover } from './TipTap/components/EditorCover';
import { EditorGlobalStyles } from './EditorGlobalStyles';
import './editor.css';

// Types
interface TiptapNotebookEditorProps {
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

export interface TiptapNotebookEditorRef {
  editor: Editor | null;
  focus: () => void;
  getHTML: () => string;
  setContent: (content: string) => void;
  clearContent: () => void;
  isEmpty: () => boolean;
  // Hybrid notebook specific methods
  getCells: () => Cell[];
  setCells: (cells: Cell[]) => void;
  addCodeCell: () => string;
  addMarkdownCell: () => string;
  addHybridCell: () => string;
  addAIThinkingCell: (
    props?: Partial<{
      agentName: string;
      customText: string | null;
      textArray: string[];
      useWorkflowThinking: boolean;
    }>
  ) => string;
  addRawCell: () => string;
}

const TiptapNotebookEditor = forwardRef<TiptapNotebookEditorRef, TiptapNotebookEditorProps>(
  (
    {
      className = 'text-2xl font-bold leading-relaxed',
      placeholder: _placeholder = 'Untitled',
      readOnly = false,
    },
    ref
  ) => {
    // Store state - use selector to ensure reactivity
    const cells = useStore((state) => state.cells);
    const setCells = useStore((state) => state.setCells);

    // Editor state
    const editorRef = useRef<Editor | null>(null);
    const [currentEditor, setCurrentEditor] = useState<Editor | null>(null);

    // Sync refs
    const isInternalUpdate = useRef<boolean>(false);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastInsertedCodeCellIdRef = useRef<string | null>(null);

    // Calculate initial content once on mount
    const initialContent = useMemo(() => {
      console.log('🔍 [TiptapNotebookEditor] calculating initialContent', {
        cellsCount: cells.length,
        hasOutputs: cells.some((c) => c.outputs && c.outputs.length > 0),
      });
      return convertCellsToHtml(cells);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - only calculate once

    // Get localized placeholder
    const { t } = useTranslation();
    const localizedPlaceholder = t('common.untitled');

    // Get extensions configuration
    const extensions = useMemo(
      () => [
        ...getTipTapExtensions(localizedPlaceholder),
        CursorStyleExtension,
        TrailingParagraphExtension,
        EnhancedCursorPositionExtension,
      ],
      [localizedPlaceholder]
    );

    // Hooks
    const { handleKeyDown } = useKeyboardHandlers();
    const cellManagement = useCellManagement({ cells, setCells });
    const editorEvents = useEditorEvents({
      cells,
      setCells,
      isInternalUpdate,
      syncTimeoutRef,
      lastInsertedCodeCellIdRef,
      setCurrentEditor,
      editorRef,
      defaultTitle: localizedPlaceholder,
    });

    // TipTap slash commands
    const slashCommands = useTipTapSlashCommands({ editor: currentEditor });

    // Initialize editor
    const editor = useEditor({
      extensions,
      content: initialContent,
      editable: !readOnly,
      onCreate: editorEvents.onCreate,
      onDestroy: editorEvents.onDestroy,
      onTransaction: editorEvents.onTransaction,
      onUpdate: editorEvents.onUpdate,
      onBlur: editorEvents.onBlur,
      editorProps: {
        attributes: {
          class: `tiptap-notebook-editor markdown-cell prose max-w-none focus:outline-none ${className}`,
          style: 'min-height: 120px; padding: 16px; transition: all 0.2s ease;',
          spellcheck: 'false',
        },
        handleKeyDown,
      },
      immediatelyRender: false,
    });

    // Link handler (needs editor to be initialized)
    const { handleEditorClick } = useLinkHandler(editor);

    // Editor sync hook
    useEditorSync({ editor, cells, isInternalUpdate });

    // Before unload handler
    useBeforeUnload({ editor, cells, setCells, isInternalUpdate, syncTimeoutRef });

    // Cleanup
    useEffect(() => {
      const currentSyncTimeout = syncTimeoutRef.current;

      const handleMarkdownFocus = (e: Event) => {
        const customEvent = e as CustomEvent;
        const { cellId, direction, sourceCellId } = customEvent.detail;

        if (editor) {
          // Find the node for this cell
          let pos = 0;
          let found = false;

          // First try to find by target cellId
          editor.state.doc.descendants((node, p) => {
            if (found) return false;
            if (node.attrs.cellId === cellId) {
              pos = p;
              found = true;
              return false;
            }
          });

          // If not found, try to find by sourceCellId and navigate relative to it
          if (!found && sourceCellId) {
            editor.state.doc.descendants((node, p) => {
              if (found) return false;
              if (node.attrs.cellId === sourceCellId) {
                // Found source cell
                if (direction === 'up') {
                  // We want the node BEFORE this source cell
                  // The source cell starts at p.
                  // The node before ends at p - 1 (if there is a node before)
                  // We need to resolve the position before.
                  // resolvedPos was unused
                  // Actually, just p is the start of the node.
                  // If we want the previous node, we can look at p - 1?
                  // Let's use resolve
                  if (p > 0) {
                    const $pos = editor.state.doc.resolve(p);
                    const index = $pos.index($pos.depth); // Index in parent
                    if (index > 0) {
                      const prevNode = $pos.parent.child(index - 1);
                      // We found the previous node. Its position start is... hard to calculate from index alone without iterating?
                      // Actually, we can just use the resolved position logic
                      // The previous node ends at p.
                      // So we want to focus at p - 1?
                      pos = p - prevNode.nodeSize;
                      found = true; // We found the "target" (previous node) position
                    }
                  }
                } else {
                  // We want the node AFTER this source cell
                  // Source cell starts at p, size is node.nodeSize
                  pos = p + node.nodeSize;
                  found = true;
                }
                return false;
              }
            });
          }

          if (found) {
            if (direction === 'up') {
              // Focus end of cell
              const node = editor.state.doc.nodeAt(pos);
              if (node) {
                // For text blocks, end is pos + content.size
                editor
                  .chain()
                  .focus()
                  .setTextSelection(pos + node.content.size + 1)
                  .run();
              }
            } else {
              // Focus start of cell
              editor
                .chain()
                .focus()
                .setTextSelection(pos + 1)
                .run();
            }
          }
        }
      };

      window.addEventListener('markdown-cell-focus', handleMarkdownFocus);

      return () => {
        window.removeEventListener('markdown-cell-focus', handleMarkdownFocus);
        if (currentSyncTimeout) {
          clearTimeout(currentSyncTimeout);
        }
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
        }
      };
    }, [editor]);

    // Expose API
    useImperativeHandle(
      ref,
      () => ({
        editor,
        focus: () => {
          if (editor) {
            const doc = editor.state.doc;
            const endPos = Math.max(0, doc.content.size - 1);
            editor.chain().focus().setTextSelection(endPos).run();
          }
        },
        getHTML: () => editor?.getHTML() || '',
        setContent: (content) => editor?.commands.setContent(content, false),
        clearContent: () => editor?.commands.clearContent(),
        isEmpty: () => !!editor?.isEmpty,
        getCells: () => cells,
        setCells: (newCells: Cell[]) => setCells(newCells),
        ...cellManagement,
      }),
      [editor, cells, setCells, cellManagement]
    );

    // Loading state
    if (!editor) {
      return (
        <div
          className="animate-pulse bg-gray-100 rounded-lg flex items-center justify-center"
          style={{ minHeight: '200px' }}
        >
          <div className="text-gray-400 text-lg">Loading notebook editor...</div>
        </div>
      );
    }

    return (
      <SimpleDragManager editor={currentEditor}>
        <div
          className="tiptap-notebook-editor-container w-full h-full bg-transparent flex flex-col"
          style={{ minHeight: '500px' }}
        >
          {/* Main editor content with drag manager */}
          <EditorCover editor={currentEditor} />

          <div className="w-full max-w-screen-lg mx-auto px-8 lg:px-18 flex flex-col flex-1">
            <div onClick={handleEditorClick} className="w-full h-full">
              <EditorBubbleMenu editor={currentEditor} />
              <EditorContent editor={editor} className="w-full h-full focus-within:outline-none" />
            </div>
            <div className="h-20 w-full flex-shrink-0"></div>
          </div>

          {/* TipTap slash commands menu */}
          <TipTapSlashCommands
            editor={currentEditor}
            isOpen={slashCommands.isMenuOpen}
            onClose={() => {
              slashCommands.removeSlashText();
              slashCommands.closeMenu();
            }}
            position={slashCommands.menuPosition}
            searchQuery={slashCommands.searchQuery}
            onQueryUpdate={slashCommands.updateSlashQuery}
          />

          {/* Editor styles */}
          <EditorGlobalStyles />
        </div>
      </SimpleDragManager>
    );
  }
);

TiptapNotebookEditor.displayName = 'TiptapNotebookEditor';

export default TiptapNotebookEditor;
