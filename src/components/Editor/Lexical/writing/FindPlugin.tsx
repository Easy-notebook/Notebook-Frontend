import { useEditorSurface } from './useEditorSurface';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { FindController, type FindMatch } from './FindController';
export function FindPlugin() {
  const session = useNotebookEditorSession(),
    readOnly = useEditorReadOnly();
  const controller = useMemo(() => new FindController(session), [session]);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false),
    [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<FindMatch[]>([]),
    [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const options = useMemo(() => ({ query, matchCase, wholeWord }), [query, matchCase, wholeWord]);
  useEffect(() => {
    const refresh = () => {
      const next = controller.find(options);
      setMatches(next);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
    };
    refresh();
    return session.editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size || dirtyLeaves.size) refresh();
    });
  }, [controller, session, options]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'f' ||
        !session.editor.getRootElement()?.contains(event.target as Node)
      )
        return;
      event.preventDefault();
      setOpen(true);
    };
    const root = session.editor.getRootElement();
    root?.addEventListener('keydown', key);
    return () => root?.removeEventListener('keydown', key);
  }, [session]);
  const next = (direction: number) => {
    if (!matches.length) return;
    const n = (index + direction + matches.length) % matches.length;
    setIndex(n);
    controller.select(matches[n]);
    input.current?.focus();
  };
  const host = useEditorSurface(session.editor);
  if (!host) return null;
  return createPortal(
    <div className="notebook-find-owner">
      <button
        className="notebook-writing-button"
        aria-label="查找替换"
        onClick={() => setOpen(!open)}
      >
        <Search size={16} />
      </button>
      {open && (
        <section
          className="notebook-find-panel"
          aria-label="正文查找替换"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              setOpen(false);
              session.editor.focus();
            }
          }}
        >
          <div className="notebook-writing-row">
            <input
              ref={input}
              aria-label="查找正文"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  next(e.shiftKey ? -1 : 1);
                }
              }}
            />
            <output aria-live="polite">
              {matches.length ? index + 1 : 0}/{matches.length}
            </output>
            <button aria-label="上一个匹配" onClick={() => next(-1)}>
              <ArrowUp size={15} />
            </button>
            <button aria-label="下一个匹配" onClick={() => next(1)}>
              <ArrowDown size={15} />
            </button>
            <button aria-label="关闭查找" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="notebook-writing-row">
            <label>
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
              />
              区分大小写
            </label>
            <label>
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
              />
              全词
            </label>
          </div>
          {!readOnly && (
            <div className="notebook-writing-row">
              <input
                aria-label="替换为"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
              <button
                disabled={!matches.length}
                onClick={() => controller.replace(options, replacement, index)}
              >
                替换
              </button>
              <button
                disabled={!matches.length}
                onClick={() => controller.replace(options, replacement)}
              >
                全部替换
              </button>
            </div>
          )}
        </section>
      )}
    </div>,
    host
  );
}
