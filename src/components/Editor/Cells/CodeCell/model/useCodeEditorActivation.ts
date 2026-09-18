import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { observePreview } from '../../../utils/previewVisibility';
import { cellNavigationRouter } from './CellNavigationRouter';
import { CodeEditorSession } from './CodeEditorSession';

/** Deferred/active/suspended lifecycle; focused and composing editors are pinned. */
export function useCodeEditorActivation(cellId: string, immediate: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(immediate);
  const pendingFocus = useRef<'up' | 'down'>();
  const editorView = useRef<EditorView>();
  const mounted = useRef(true);
  const visible = useRef(false);
  const pinned = useRef(immediate);
  pinned.current = immediate;
  const eviction = useRef<ReturnType<typeof setTimeout>>();
  const [session] = useState(() => new CodeEditorSession());
  const active = activated || immediate;

  const cancelEviction = useCallback(() => {
    if (eviction.current !== undefined) clearTimeout(eviction.current);
    eviction.current = undefined;
  }, []);
  const maySuspend = useCallback(() => {
    const view = editorView.current;
    return (
      mounted.current &&
      view &&
      !visible.current &&
      !pinned.current &&
      !pendingFocus.current &&
      !view.hasFocus &&
      !view.composing
    );
  }, []);
  const scheduleEviction = useCallback(() => {
    if (!maySuspend()) {
      cancelEviction();
      return;
    }
    if (eviction.current !== undefined) return;
    eviction.current = setTimeout(() => {
      eviction.current = undefined;
      if (!maySuspend()) return;
      session.capture(editorView.current!);
      editorView.current = undefined;
      setActivated(false);
    }, 500);
  }, [cancelEviction, maySuspend, session]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelEviction();
      session.release();
      editorView.current = undefined;
      pendingFocus.current = undefined;
    };
  }, [cancelEviction, session]);
  const flushFocus = useCallback(() => {
    queueMicrotask(() => {
      const view = editorView.current;
      const direction = pendingFocus.current;
      if (!mounted.current || !view?.dom.isConnected || !direction) return;
      pendingFocus.current = undefined;
      const anchor = direction === 'up' ? view.state.doc.length : 0;
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      // CodeMirror scrolls its own viewport; the notebook's outer scroller must
      // also expose an offscreen cell before focus is transferred.
      view.dom.scrollIntoView({ block: 'nearest' });
      view.focus();
    });
  }, []);

  useEffect(() => {
    if (immediate) setActivated(true);
    scheduleEviction();
  }, [immediate, scheduleEviction]);
  useEffect(() => {
    if (!container.current) return;
    return observePreview(container.current, (inViewport) => {
      visible.current = inViewport;
      if (inViewport) setActivated(true);
      scheduleEviction();
    });
  }, [scheduleEviction]);
  useEffect(() => {
    return cellNavigationRouter.subscribe(cellId, (direction) => {
      pendingFocus.current = direction;
      cancelEviction();
      setActivated(true);
      flushFocus();
    });
  }, [cellId, flushFocus, cancelEviction]);

  const activate = useCallback(() => {
    pendingFocus.current = 'down';
    cancelEviction();
    setActivated(true);
  }, [cancelEviction]);
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      editorView.current = view;
      if (!pendingFocus.current) session.restoreScroll(view);
      else session.release();
      flushFocus();
      scheduleEviction();
    },
    [flushFocus, scheduleEviction, session]
  );
  const onUpdate = useCallback((_update: ViewUpdate) => scheduleEviction(), [scheduleEviction]);
  const onInputSettled = useCallback(() => queueMicrotask(scheduleEviction), [scheduleEviction]);
  return {
    container,
    active,
    activate,
    onCreateEditor,
    onUpdate,
    onInputSettled,
    initialState: (value: string) => (editorView.current ? undefined : session.initialState(value)),
    placeholderHeight: session.height,
  };
}
