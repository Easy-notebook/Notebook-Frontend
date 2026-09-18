import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { observePreview } from '../../../utils/previewVisibility';
import { cellNavigationRouter } from './CellNavigationRouter';

/** Deferred -> active is one-way: retain the editor's history and IME state after activation. */
export function useCodeEditorActivation(cellId: string, immediate: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(immediate);
  const pendingFocus = useRef<'up' | 'down'>();
  const active = activated || immediate;

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
    if (active) return;
    return cellNavigationRouter.subscribe(cellId, (direction) => {
      pendingFocus.current = direction;
      setActivated(true);
    });
  }, [active, cellId]);

  const activate = useCallback(() => {
    pendingFocus.current = 'down';
    setActivated(true);
  }, []);
  const onCreateEditor = useCallback((view: EditorView) => {
    const direction = pendingFocus.current;
    pendingFocus.current = undefined;
    if (!direction) return;
    queueMicrotask(() => {
      if (!view.dom.isConnected) return;
      const anchor = direction === 'up' ? view.state.doc.length : 0;
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      view.focus();
    });
  }, []);
  return { container, active, activate, onCreateEditor };
}
