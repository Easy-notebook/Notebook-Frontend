import { writingScroller, revealWritingPosition } from './WritingViewport';
import { useEditorSurface } from './useEditorSurface';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { $notebookBlock } from '../interaction/NotebookBlockCommands';
import useStore from '@Store/notebookStore';
import './writing.css';
import { SourcePane } from './SourcePane';
import { PenLine, Code2, Columns2, Maximize2, Focus, Keyboard, Info } from 'lucide-react';

/** View-only modes never rebuild the document or replace its session/history. */
export function WritingModesPlugin() {
  const session = useNotebookEditorSession();
  const [view, setView] = useState<'rich' | 'source' | 'split'>('rich');
  const [zen, setZen] = useState(false),
    [typewriter, setTypewriter] = useState(false),
    [focus, setFocus] = useState(false);
  const [count, setCount] = useState({ characters: 0, words: 0 });
  const focused = useRef<HTMLElement | null>(null);
  const cells = useStore((s) => s.cells);
  useEffect(() => {
    const text = cells
      .filter((c) => c.type === 'markdown')
      .map((c) => c.content)
      .join('\n');
    setCount({
      characters: [...text.replace(/\s/g, '')].length,
      words: text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0,
    });
  }, [cells]);
  useEffect(() => {
    const root = session.editor.getRootElement();
    const host = root?.closest<HTMLElement>('.notebook-editor-container');
    if (!root || !host) return;
    host.dataset.zen = String(zen);
    host.dataset.writingView = view;
    root.dataset.focusMode = String(focus);
    host.dataset.typewriter = String(typewriter);
    const scroller = writingScroller(root);
    const resize = new ResizeObserver(() => {
      host.style.setProperty('--writing-viewport-height', `${scroller?.clientHeight ?? 0}px`);
    });
    if (scroller) resize.observe(scroller);
    let frame = 0;
    const update = () => {
      session.editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const block = $notebookBlock(selection.anchor.getNode());
        const element = block ? session.editor.getElementByKey(block.getKey()) : null;
        focused.current?.removeAttribute('data-writing-focus');
        focused.current = element;
        element?.setAttribute('data-writing-focus', 'true');
      });
      if (!typewriter || !root.contains(document.activeElement) || session.editor.isComposing())
        return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return;
        const caret = selection.getRangeAt(0).getBoundingClientRect();
        if (!caret.height) return;
        if (scroller) revealWritingPosition(scroller, caret.top + caret.height / 2, true);
      });
    };
    const detach = session.editor.registerUpdateListener(update);
    update();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zen) {
        setZen(false);
        e.preventDefault();
      }
    };
    host.addEventListener('keydown', escape);
    return () => {
      detach();
      resize.disconnect();
      delete host.dataset.typewriter;
      host.style.removeProperty('--writing-viewport-height');
      cancelAnimationFrame(frame);
      delete host.dataset.zen;
      delete host.dataset.writingView;
      delete root.dataset.focusMode;
      focused.current?.removeAttribute('data-writing-focus');
      host.removeEventListener('keydown', escape);
    };
  }, [session, zen, typewriter, focus, view]);
  const host = useEditorSurface(session.editor);
  if (!host) return null;
  return (
    <>
      <SourcePane mode={view} />
      {createPortal(
        <div className="notebook-writing-modes" role="toolbar" aria-label="写作模式">
          <div className="notebook-view-switch" role="group" aria-label="编辑视图">
            {(
              [
                ['rich', '书写', PenLine],
                ['source', '源码', Code2],
                ['split', '分屏', Columns2],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="禅模式"
            title="禅模式 · Esc 退出"
            aria-pressed={zen}
            onClick={() => setZen(!zen)}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="专注段落"
            title="专注段落"
            aria-pressed={focus}
            onClick={() => setFocus(!focus)}
          >
            <Focus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="打字机"
            title="打字机"
            aria-pressed={typewriter}
            onClick={() => setTypewriter(!typewriter)}
          >
            <Keyboard size={16} aria-hidden="true" />
          </button>
          <span
            className="notebook-writing-stats"
            tabIndex={0}
            role="img"
            aria-label={`正文统计：${count.characters} 字符 · ${count.words} 词`}
            title={`${count.characters} 字符 · ${count.words} 词`}
          >
            <Info size={16} aria-hidden="true" />
          </span>
        </div>,
        host
      )}
    </>
  );
}
