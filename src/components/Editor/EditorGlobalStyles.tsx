/**
 * Global Editor Width Constraint Styles
 * Ensures editor content stays within container bounds - moderate approach
 */

import { useEffect } from 'react';

export const useEditorGlobalStyles = () => {
  useEffect(() => {
    const styleId = 'editor-global-width-constraints';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Editor containers - basic constraints */
      .jupyter-notebook-editor,
      .tiptap-notebook-editor-container {
        max-width: 100%;
        box-sizing: border-box;
        overflow-x: hidden;
      }

      /* Cell wrappers */
      .draggable-cell,
      .cell-wrapper {
        max-width: 100%;
        box-sizing: border-box;
      }

      /* Tables - prevent overflow */
      .jupyter-notebook-editor table,
      .tiptap-notebook-editor table,
      .ProseMirror table {
        max-width: 100%;
        table-layout: fixed;
        word-wrap: break-word;
        box-sizing: border-box;
      }

      /* Code blocks - allow horizontal scroll */
      .cell-output pre,
      .ProseMirror pre,
      .code-cell pre {
        max-width: 100%;
        overflow-x: auto;
        box-sizing: border-box;
      }

      /* Images - scale to fit */
      .jupyter-notebook-editor img,
      .tiptap-notebook-editor img,
      .ProseMirror img {
        max-width: 100%;
        height: auto;
      }

      /* Output containers */
      .cell-output,
      .output-container {
        max-width: 100%;
        overflow-x: auto;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);
};

export const EditorGlobalStyles = () => {
  useEditorGlobalStyles();
  return null;
};
