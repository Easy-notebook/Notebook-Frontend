import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotebookHeading } from './NotebookOutlineModel';

/** Resolves cell-local heading positions; duplicate labels and legacy anchor IDs are harmless. */
export function resolveOutlineTarget(
  root: HTMLElement,
  heading: NotebookHeading
): HTMLElement | null {
  const cell = root.querySelector<HTMLElement>(`[data-cell-id="${CSS.escape(heading.cellId)}"]`);
  if (!cell) return null;
  if (heading.isTitle) return cell.querySelector<HTMLElement>('.node-title-content') ?? cell;
  if (cell.matches('[data-type="markdown-source-cell"]')) return cell;
  return cell.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')[heading.ordinal] ?? null;
}

export function useNotebookOutlineNavigation(
  notebookId: string | null,
  headings: NotebookHeading[]
) {
  const [activeKey, setActiveKey] = useState('');
  const rootRef = useRef<HTMLElement | null>(null);
  const navigationTarget = useRef<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const scope = `.notebook-editor-container[data-notebook-id="${CSS.escape(notebookId || '')}"]`;
    const update = () => {
      frame = 0;
      const root = document.querySelector<HTMLElement>(scope);
      rootRef.current = root;
      if (!root) {
        setActiveKey('');
        return;
      }
      let scroller = root.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
        scroller = scroller.parentElement;
      const requested = headings.find((heading) => heading.key === navigationTarget.current);
      const requestedElement = requested && resolveOutlineTarget(root, requested);
      if (requestedElement) {
        const rect = requestedElement.getBoundingClientRect();
        const viewport = scroller?.getBoundingClientRect();
        if (
          rect.bottom > (viewport?.top ?? 0) &&
          rect.top < (viewport?.bottom ?? window.innerHeight)
        ) {
          setActiveKey(requested!.key);
          return;
        }
      }
      const readingLine = (scroller?.getBoundingClientRect().top ?? 0) + 80;
      let active = '';
      for (const entry of headings) {
        const target = resolveOutlineTarget(root, entry);
        if (!target || !target.getClientRects().length) continue;
        if (!active) active = entry.key;
        if (target.getBoundingClientRect().top > readingLine) break;
        active = entry.key;
      }
      setActiveKey(active);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const releaseNavigation = () => {
      navigationTarget.current = null;
    };
    document.addEventListener('wheel', releaseNavigation, { passive: true });
    document.addEventListener('pointerdown', releaseNavigation);
    document.addEventListener('keydown', releaseNavigation);
    // Cell mounts, edits and deferred previews all change the same reading geometry.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      navigationTarget.current = null;
      document.removeEventListener('wheel', releaseNavigation);
      document.removeEventListener('pointerdown', releaseNavigation);
      document.removeEventListener('keydown', releaseNavigation);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      rootRef.current = null;
    };
  }, [notebookId, headings]);
  const navigate = useCallback((heading: NotebookHeading) => {
    const root = rootRef.current;
    if (!root) return;
    const target = resolveOutlineTarget(root, heading);
    if (!target) return;
    navigationTarget.current = heading.key;
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    setActiveKey(heading.key);
  }, []);
  return { activeKey, navigate };
}
