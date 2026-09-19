import { useMemo } from 'react';
import type { Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { markdownHighlighting } from './markdownHighlighting';

const baseExtensions = [
  markdown(),
  EditorView.lineWrapping,
  syntaxHighlighting(markdownHighlighting),
];
export const markdownEditorTheme = EditorView.theme({
  '&': {
    border: 'none !important',
    boxShadow: 'none !important',
    backgroundColor: 'transparent !important',
    padding: 0,
    fontSize: '1rem',
    lineHeight: '1.6',
  },
  '.cm-scroller': {
    backgroundColor: 'transparent !important',
    padding: 0,
  },
  '.cm-content': {
    padding: 0,
    minHeight: 'auto',
  },
  '.cm-focused': {
    outline: 'none !important',
  },
  '.cm-editor': {
    fontSize: '1rem !important',
    lineHeight: '1.6 !important',
  },
});

export function useMarkdownEditorExtensions(boundaryKeymap: Extension) {
  return useMemo(() => [...baseExtensions, boundaryKeymap], [boundaryKeymap]);
}
