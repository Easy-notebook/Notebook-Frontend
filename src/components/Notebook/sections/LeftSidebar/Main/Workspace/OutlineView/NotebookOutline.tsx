import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import useStore from '@Store/notebookStore';
import { NotebookOutlineModel } from './NotebookOutlineModel';
import { useNotebookOutlineNavigation } from './useNotebookOutlineNavigation';
import './NotebookOutline.css';

export function NotebookOutline({
  onPhaseSelect,
}: {
  onPhaseSelect?: (phase: string, step: string) => void;
}) {
  const cells = useStore((state) => state.cells);
  const notebookId = useStore((state) => state.notebookId);
  const headings = useMemo(() => NotebookOutlineModel.project(cells), [cells]);
  const { activeKey, navigate } = useNotebookOutlineNavigation(notebookId, headings);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const following = useRef(true);
  const nav = useRef<HTMLElement>(null);
  const parents = useMemo(() => new Set(headings.map((heading) => heading.parent)), [headings]);
  const visible = useMemo(
    () => NotebookOutlineModel.visible(headings, collapsed),
    [headings, collapsed]
  );
  useEffect(() => {
    setCollapsed(new Set());
    following.current = true;
  }, [notebookId]);
  useEffect(() => {
    if (!following.current) return;
    const current = nav.current?.querySelector<HTMLElement>('[aria-current="location"]');
    const surface = nav.current?.querySelector<HTMLElement>('.notebook-outline-list');
    if (!current || !surface) return;
    const row = current.getBoundingClientRect();
    const bounds = surface.getBoundingClientRect();
    if (row.top < bounds.top) surface.scrollTop += row.top - bounds.top - 8;
    else if (row.bottom > bounds.bottom) surface.scrollTop += row.bottom - bounds.bottom + 8;
  }, [activeKey]);
  return (
    <nav ref={nav} className="notebook-outline" aria-label="Notebook outline">
      {!headings.length ? (
        <p className="notebook-outline-empty">添加标题后，目录会显示在这里。</p>
      ) : (
        <ol
          className="notebook-outline-list"
          onWheel={() => {
            following.current = false;
          }}
          onTouchMove={() => {
            following.current = false;
          }}
        >
          {visible.map((heading) => (
            <li
              key={heading.key}
              style={{ '--outline-depth': heading.depth } as React.CSSProperties}
            >
              {parents.has(heading.key) ? (
                <button
                  type="button"
                  className="notebook-outline-fold"
                  aria-label={`${collapsed.has(heading.key) ? 'Expand' : 'Collapse'} ${heading.title}`}
                  aria-expanded={!collapsed.has(heading.key)}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(heading.key)) next.delete(heading.key);
                      else next.add(heading.key);
                      return next;
                    })
                  }
                >
                  {collapsed.has(heading.key) ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className={`notebook-outline-link ${heading.isTitle ? 'is-title' : ''}`}
                title={`${heading.number} ${heading.title}`.trim()}
                aria-label={`${heading.number} ${heading.title}`.trim()}
                aria-current={heading.key === activeKey ? 'location' : undefined}
                onClick={() => {
                  following.current = true;
                  if (heading.phaseId && heading.stepId)
                    onPhaseSelect?.(heading.phaseId, heading.stepId);
                  navigate(heading);
                }}
              >
                {heading.number && (
                  <span className="notebook-outline-number">{heading.number}</span>
                )}
                <span>{heading.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
