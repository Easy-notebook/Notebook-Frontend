/**
 * Editor Sync Hook
 * Manages bidirectional synchronization between editor state and cells
 */

import { useEffect, useRef, useMemo } from 'react';
import { Editor } from '@tiptap/react';
import { Cell } from '@Store/notebookStore';
import { convertCellsToHtml } from '@Editor/utils/cellConverters';

const DEBUG = false;

interface UseEditorSyncProps {
  editor: Editor | null;
  cells: Cell[];
  isInternalUpdate: React.MutableRefObject<boolean>;
}

export function useEditorSync({ editor, cells, isInternalUpdate }: UseEditorSyncProps) {
  const lastCellsRef = useRef<Cell[]>([]);

  // Initialize lastCellsRef
  useEffect(() => {
    lastCellsRef.current = cells;
  }, []);

  // Sync external cell changes to editor
  useEffect(() => {
    if (editor && cells && !isInternalUpdate.current) {
      const lastCells = lastCellsRef.current;

      // Complete update check: ensure all cell types are handled correctly
      const needsTiptapUpdate =
        cells.length !== lastCells.length ||
        cells.some((cell, index) => {
          const lastCell = lastCells[index];
          if (!lastCell) return true; // New cell

          // ID change (order change)
          if (cell.id !== lastCell.id) return true;

          // Type change
          if (cell.type !== lastCell.type) return true;

          // markdown cell content change needs tiptap update
          if (cell.type === 'markdown' && cell.content !== lastCell.content) return true;

          // image cell content or metadata change also needs tiptap update
          if (cell.type === 'image') {
            if (cell.content !== lastCell.content) return true;
            // Check metadata change (especially generation status)
            if (JSON.stringify(cell.metadata || {}) !== JSON.stringify(lastCell.metadata || {}))
              return true;
          }

          // thinking cell field changes also need update (agentName/customText/textArray/useWorkflowThinking)
          if (cell.type === 'thinking') {
            const fieldsChanged =
              (cell as any).agentName !== (lastCell as any).agentName ||
              (cell as any).customText !== (lastCell as any).customText ||
              JSON.stringify((cell as any).textArray || []) !==
                JSON.stringify((lastCell as any).textArray || []) ||
              (cell as any).useWorkflowThinking !== (lastCell as any).useWorkflowThinking;
            if (fieldsChanged) return true;
          }

          // code cell and other cell type content and output changes also need sync to tiptap
          if (cell.type === 'code' || cell.type === 'hybrid') {
            // Check code content change
            if (cell.content !== lastCell.content) return true;
            // Check output change
            if (JSON.stringify(cell.outputs || []) !== JSON.stringify(lastCell.outputs || []))
              return true;
          }

          // raw cell content change needs tiptap update
          if (cell.type === 'raw') {
            if (cell.content !== lastCell.content) return true;
          }

          return false;
        });

      // Additional check: skip tiptap update if triggered by InputRule
      const hasNewCodeBlock = cells.some(
        (cell) => cell.type === 'code' && !lastCells.find((lastCell) => lastCell.id === cell.id)
      );

      if (hasNewCodeBlock) {
        if (DEBUG) console.log('检测到新代码块，跳过tiptap更新以避免冲突');
        lastCellsRef.current = cells; // Still update cache
        return;
      }

      if (needsTiptapUpdate) {
        if (DEBUG) {
          console.log('=== 外部cells变化，需要更新tiptap ===');
          console.log(
            '原有cells:',
            lastCells.map((c, i) => ({ index: i, id: c.id, type: c.type }))
          );
          console.log(
            '新的cells:',
            cells.map((c, i) => ({ index: i, id: c.id, type: c.type }))
          );
        }

        isInternalUpdate.current = true;
        const expectedHtml = convertCellsToHtml(cells);

        // Use setTimeout to defer setContent to next event loop, avoiding flushSync warning
        setTimeout(() => {
          editor.commands.setContent(expectedHtml, false);
        }, 0);

        setTimeout(() => {
          isInternalUpdate.current = false;
        }, 50);

        // Update cache
        lastCellsRef.current = cells;

        if (DEBUG) console.log('=== tiptap内容已更新 ===');
      }
    }
  }, [cells, editor, isInternalUpdate]);

  // Enhanced: fast sync for thinking cells (even if structure change detection is not triggered)
  const thinkingSignature = useMemo(() => {
    try {
      return JSON.stringify(
        (cells || [])
          .filter((c: any) => c.type === 'thinking')
          .map((c: any) => ({
            id: c.id,
            agentName: c.agentName || '',
            customText: c.customText || '',
            textArray: Array.isArray(c.textArray) ? c.textArray : [],
            useWorkflowThinking: !!c.useWorkflowThinking,
          }))
      );
    } catch {
      return 'thinking-signature-error';
    }
  }, [cells]);

  const lastThinkingSignatureRef = useRef<string>('');

  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) return;

    if (thinkingSignature && thinkingSignature !== lastThinkingSignatureRef.current) {
      // Force lightweight refresh based on thinking change only
      isInternalUpdate.current = true;
      const expectedHtml = convertCellsToHtml(cells);
      setTimeout(() => {
        editor.commands.setContent(expectedHtml, false);
        lastThinkingSignatureRef.current = thinkingSignature;
        setTimeout(() => {
          isInternalUpdate.current = false;
        }, 30);
      }, 0);
    }
  }, [thinkingSignature, editor, cells, isInternalUpdate]);
}
