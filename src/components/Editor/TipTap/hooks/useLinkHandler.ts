/**
 * Link Handler Hook
 * Handles link clicks within the editor for split preview functionality
 */

import { useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Selection } from 'prosemirror-state';
import { isBlankArea, debouncedFocus } from '@Editor/utils/cursorPositioning';

const DEBUG = false;

export function useLinkHandler(editor: Editor | null) {
  const handleEditorClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // Handle link click for split preview functionality
      const anchor = target?.closest('a') as HTMLAnchorElement | null;
      if (anchor) {
        const hrefAttr = anchor.getAttribute('href');
        if (!hrefAttr) return;
        e.preventDefault();

        Promise.all([
          import('@Store/notebookStore'),
          import('@Store/previewStore'),
          import('@Config/base_url'),
        ]).then(async ([nbMod, pvMod, cfgMod]) => {
          const useNotebookStore = (nbMod as any).default;
          const usePreviewStore = (pvMod as any).default;
          const Backend_BASE_URL = cfgMod?.Backend_BASE_URL;

          const notebookId = useNotebookStore.getState().notebookId;
          if (!notebookId) return;

          const href = hrefAttr;
          const base = (Backend_BASE_URL as string)?.replace(/\/$/, '');
          let filePath: string | null = null;
          try {
            const pattern = new RegExp(`^${base}/download_file/${notebookId}/(.+)$`);
            const m = href.match(pattern);
            if (m && m[1]) filePath = decodeURIComponent(m[1]);
          } catch {
            // Ignore regex parsing errors
          }
          if (!filePath) {
            const relPattern = new RegExp('^(\\.|\\.\\.|[^:/?#]+$|\\.\\/\\assets\\/|\\assets\\/)');
            if (relPattern.test(href)) {
              filePath = href.replace(new RegExp('^\\./'), '');
            } else if (!new RegExp('^[a-z]+://', 'i').test(href) && href.indexOf('/') === -1) {
              filePath = href;
            }
          }

          if (!filePath) {
            window.open(href, '_blank', 'noopener,noreferrer');
            return;
          }

          try {
            // Use the new split preview system - bypasses tab validation
            const fileObj = {
              name: filePath.split('/').pop() || filePath,
              path: filePath,
              type: 'file',
            } as any;
            await usePreviewStore.getState().previewFileInSplit(notebookId, filePath, {
              file: fileObj,
            } as any);

            // Switch to file preview mode if currently in notebook mode
            if (usePreviewStore.getState().previewMode !== 'file') {
              usePreviewStore.getState().changePreviewMode();
            }

            console.log('🔀 Split preview opened for file:', filePath);
          } catch (err: any) {
            if (DEBUG) console.error('TipTap link split preview failed:', err);
            // Fallback: try root directory file if assets doesn't exist
            try {
              const baseName = (filePath || href).split('/').pop() || '';
              if (baseName && baseName !== filePath) {
                const fileObj2 = { name: baseName, path: baseName, type: 'file' } as any;
                await usePreviewStore
                  .getState()
                  .previewFileInSplit(notebookId, baseName, { file: fileObj2 } as any);

                if (usePreviewStore.getState().previewMode !== 'file') {
                  usePreviewStore.getState().changePreviewMode();
                }
                console.log('🔀 Split preview opened for fallback file:', baseName);
                return;
              }
            } catch (e) {
              if (DEBUG) console.error('Fallback to root failed:', e);
            }
          }
        });
        return;
      }

      // Handle clicking blank area
      if (target && isBlankArea(target)) {
        // Use TipTap editor to position cursor at end of document
        if (editor) {
          debouncedFocus(() => {
            try {
              const { state } = editor;
              const { doc } = state;
              const endPos = doc.content.size - 1;
              const $end = doc.resolve(Math.max(0, endPos));
              const selection = Selection.near($end, 1);
              const tr = state.tr.setSelection(selection);
              editor.view.dispatch(tr);
              editor.view.focus();
            } catch (e) {
              console.warn('Failed to focus TipTap editor at end:', e);
              // Fallback: just focus the editor
              editor.commands.focus('end');
            }
          });
        }
      }
    },
    [editor]
  );

  return { handleEditorClick };
}
