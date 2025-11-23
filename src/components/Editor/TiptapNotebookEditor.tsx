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
      placeholder = 'Untitled',
      readOnly = false,
    },
    ref
  ) => {
    // Store state - use selector to ensure reactivity
    const cells = useStore((state) => state.cells);
    const setCells = useStore((state) => state.setCells);

    // Debug: Log cells changes
    useEffect(() => {
      console.log('🔍 [TiptapNotebookEditor] cells changed', {
        cellsCount: cells.length,
        cellIds: cells.map((c) => c.id),
        cellTypes: cells.map((c) => c.type),
      });
    }, [cells]);

    // Editor state
    const editorRef = useRef<Editor | null>(null);
    const [currentEditor, setCurrentEditor] = useState<Editor | null>(null);

    // Sync refs
    const isInternalUpdate = useRef<boolean>(false);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastInsertedCodeCellIdRef = useRef<string | null>(null);

    // Calculate initial content once on mount
    const initialContent = useMemo(() => {
      return convertCellsToHtml(cells);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - only calculate once

    // Get extensions configuration
    const extensions = useMemo(
      () => [
        ...getTipTapExtensions(placeholder),
        CursorStyleExtension,
        TrailingParagraphExtension,
        EnhancedCursorPositionExtension,
      ],
      [placeholder]
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
      return () => {
        if (currentSyncTimeout) {
          clearTimeout(currentSyncTimeout);
        }
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
        }
      };
    }, []);

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
