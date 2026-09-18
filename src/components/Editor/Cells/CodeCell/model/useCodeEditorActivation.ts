import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { observePreview } from '../../../utils/previewVisibility';
import { cellNavigationRouter } from './CellNavigationRouter';

/** Deferred -> active is one-way: retain the editor's history and IME state after activation. */
export function useCodeEditorActivation(cellId: string, immediate: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(immediate);
  const pendingFocus = useRef<'up' | 'down'>();
  const editorView = useRef<EditorView>();
  const mounted = useRef(true);
  const active = activated || immediate;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      editorView.current = undefined;
      pendingFocus.current = undefined;
    };
  }, []);
  const flushFocus = useCallback(() => {
    queueMicrotask(() => {
      const view = editorView.current;
      const direction = pendingFocus.current;
      if (!mounted.current || !view?.dom.isConnected || !direction) return;
      pendingFocus.current = undefined;
      const anchor = direction === 'up' ? view.state.doc.length : 0;
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      view.focus();
    });
  }, []);

  useEffect(() => {
    if (immediate) setActivated(true);
  }, [immediate]);
  useEffect(() => {
    if (active || !container.current) return;
    return observePreview(container.current, (visible) => {
      if (visible) setActivated(true);
    });
  }, [active]);
  useEffect(() => {
    return cellNavigationRouter.subscribe(cellId, (direction) => {
      pendingFocus.current = direction;
      setActivated(true);
      flushFocus();
    });
  }, [cellId, flushFocus]);

  const activate = useCallback(() => {
    pendingFocus.current = 'down';
    setActivated(true);
  }, []);
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      editorView.current = view;
      flushFocus();
    },
    [flushFocus]
  );
  return { container, active, activate, onCreateEditor };
}
