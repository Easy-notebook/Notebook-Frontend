import { useEditorSurface } from './useEditorSurface';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { $notebookBlock } from '../interaction/NotebookBlockCommands';
import useStore from '@Store/notebookStore';
import './writing.css';
import { SourcePane } from './SourcePane';

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
        let scroller: HTMLElement | null = root.parentElement;
        while (
          scroller &&
          !(
            scroller.scrollHeight > scroller.clientHeight &&
            /auto|scroll/.test(getComputedStyle(scroller).overflowY)
          )
        )
          scroller = scroller.parentElement;
        if (!scroller) return;
        const box = scroller.getBoundingClientRect();
        const delta = caret.top - (box.top + box.height * 0.45);
        if (Math.abs(delta) > 2)
          scroller.scrollBy({
            top: delta,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          });
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
          <select
            aria-label="编辑视图"
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
          >
            <option value="rich">书写</option>
            <option value="source">源码</option>
            <option value="split">分屏</option>
          </select>
          <button aria-pressed={zen} onClick={() => setZen(!zen)}>
            禅模式
          </button>
          <button aria-pressed={focus} onClick={() => setFocus(!focus)}>
            专注段落
          </button>
          <button aria-pressed={typewriter} onClick={() => setTypewriter(!typewriter)}>
            打字机
          </button>
          <output aria-label="正文统计">
            {count.characters} 字符 · {count.words} 词
          </output>
        </div>,
        host
      )}
    </>
  );
}
