import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $isElementNode,
  type LexicalNode,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
} from 'lexical';
import {
  GripVertical,
  Plus,
  Copy,
  Scissors,
  Trash2,
  Link2,
  ChevronLeft,
  ArrowUpToLine,
  Type,
  MessageSquare,
  ChevronsUpDown,
  Columns3,
  Palette,
} from 'lucide-react';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import {
  NotebookBlockCommands,
  $notebookBlock,
  BLOCK_TYPES,
  type BlockType,
} from '../interaction/NotebookBlockCommands';
import {
  blockControlPosition,
  leftMenuPosition,
  nearestBlock,
  type BlockFrame,
} from '../interaction/BlockGeometry';
import './block-tools.css';
type Anchor = { key: string; left: number; top: number };
type Menu =
  | { phase: 'closed' }
  | {
      phase: 'open';
      anchor: Anchor;
      page: 'actions' | 'insert' | 'convert' | 'colors' | 'columns';
    };
type Drag =
  | { phase: 'idle' }
  | {
      phase: 'pressed' | 'dragging';
      key: string;
      source: string;
      x: number;
      y: number;
      target?: { key: string; after: boolean; top: number; left: number; width: number };
    };
/** One owner for gutter focus, menu lifetime and pointer drag transactions. */
export function BlockToolsPlugin() {
  const [editor] = useLexicalComposerContext();
  const session = useNotebookEditorSession();
  const readOnly = useEditorReadOnly();
  const commands = useMemo(() => new NotebookBlockCommands(session), [session]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [menu, setMenu] = useState<Menu>({ phase: 'closed' });
  const menuRef = useRef<Menu>(menu);
  menuRef.current = menu;
  const [drop, setDrop] = useState<{ top: number; left: number; width: number } | null>(null);
  const drag = useRef<Drag>({ phase: 'idle' });
  const panel = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const close = () => {
    setMenu({ phase: 'closed' });
    setQuery('');
    setError('');
  };
  const open = (value: Anchor, page: 'actions' | 'insert' = 'actions') => {
    setAnchor(value);
    setMenu({ phase: 'open', anchor: value, page });
    setQuery('');
    setError('');
  };
  useEffect(() => {
    if (readOnly) {
      setAnchor(null);
      close();
      return;
    }
    const resolve = (element: Element | null): Anchor | null => {
      const root = editor.getRootElement();
      if (!element || !root?.contains(element)) return null;
      return editor.read(() => {
        const block = $notebookBlock($getNearestNodeFromDOMNode(element));
        if (!block) return null;
        const dom = editor.getElementByKey(block.getKey());
        if (!dom) return null;
        return { key: block.getKey(), ...blockControlPosition(dom) };
      });
    };
    const move = (event: PointerEvent) => {
      if (drag.current.phase !== 'idle') {
        const current = drag.current;
        if (
          Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5 &&
          current.phase === 'pressed'
        )
          return;
        current.phase = 'dragging';
        close();
        editor.getRootElement()?.classList.add('notebook-block-dragging');
        const frames = editor.read(() => {
          const result: BlockFrame[] = [];
          const visit = (node: LexicalNode) => {
            if ($notebookBlock(node) === node) {
              const dom = editor.getElementByKey(node.getKey());
              if (dom) {
                const rect = dom.getBoundingClientRect();
                result.push({
                  key: node.getKey(),
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  bottom: rect.bottom,
                });
              }
              return;
            }
            if ($isElementNode(node)) node.getChildren().forEach(visit);
          };
          $getRoot().getChildren().forEach(visit);
          return result;
        });
        const nearest = nearestBlock(frames, event.clientX, event.clientY);
        current.target = nearest?.key === current.key ? undefined : (nearest ?? undefined);
        setDrop(current.target ?? null);
        return;
      }
      if (
        menuRef.current.phase === 'open' ||
        controls.current?.contains(event.target as Node) ||
        panel.current?.contains(event.target as Node)
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      const resolved = resolve(target);
      if (resolved) setAnchor(resolved);
    };
    const release = (event: Event) => {
      const current = drag.current;
      drag.current = { phase: 'idle' };
      editor.getRootElement()?.classList.remove('notebook-block-dragging');
      setDrop(null);
      if (current.phase === 'idle') return;
      if (event.type === 'pointercancel' || event.type === 'blur') return;
      if (
        current.phase === 'dragging' &&
        current.target &&
        commands.describe(current.key)?.markdown === current.source
      )
        commands.move(current.key, current.target.key, current.target.after);
      else if (current.phase === 'pressed') {
        const element = editor.getElementByKey(current.key);
        const target = element && resolve(element);
        if (target) open(target);
      }
    };
    const selected = () => {
      if (menuRef.current.phase === 'open') return;
      editor.read(() => {
        const selection = $getSelection();
        const node = $isRangeSelection(selection)
          ? $notebookBlock(selection.anchor.getNode())
          : null;
        const element = node && editor.getElementByKey(node.getKey());
        if (element) setAnchor(resolve(element));
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !controls.current?.contains(event.target as Node)
      )
        close();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        drag.current = { phase: 'idle' };
        editor.getRootElement()?.classList.remove('notebook-block-dragging');
        setDrop(null);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === 'Space' &&
        editor.getRootElement()?.contains(document.activeElement)
      ) {
        event.preventDefault();
        editor.read(() => {
          const selection = $getSelection();
          const node = $isRangeSelection(selection)
            ? $notebookBlock(selection.anchor.getNode())
            : null;
          const element = node && editor.getElementByKey(node.getKey());
          const target = element && resolve(element);
          if (target) open(target);
        });
      }
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      if (menuRef.current.phase === 'open') close();
      setAnchor(null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    const detach = editor.registerUpdateListener(selected);
    return () => {
      detach();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
      drag.current = { phase: 'idle' };
      editor.getRootElement()?.classList.remove('notebook-block-dragging');
    };
  }, [editor, commands, readOnly]);
  const menuPage = menu.phase === 'open' ? menu.page : null;
  useEffect(() => {
    if (menu.phase === 'open')
      panel.current?.querySelector<HTMLElement>('button,input')?.focus({ preventScroll: true });
  }, [menu.phase, menuPage]);
  useLayoutEffect(() => {
    if (menu.phase !== 'open' || !panel.current) return;
    const element = panel.current;
    const place = () => {
      element.style.width = `${Math.min(288, Math.max(200, menu.anchor.left - 16), window.innerWidth - 16)}px`;
      const position = leftMenuPosition(menu.anchor, element.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      Object.assign(element.style, {
        left: `${position.left}px`,
        top: `${position.top}px`,
        visibility: 'visible',
      });
    };
    const observer = new ResizeObserver(place);
    observer.observe(element);
    place();
    return () => observer.disconnect();
  }, [menu]);
  if (readOnly || !anchor) return null;
  const active = menu.phase === 'open' ? menu.anchor : anchor;
  const description = commands.describe(active.key);
  if (!description) return null;
  const run = (action: () => void) => {
    action();
    close();
  };
  const copy = async (cut = false) => {
    try {
      const original = commands.describe(active.key)?.markdown;
      if (original === undefined) return;
      await navigator.clipboard.writeText(original);
      if (cut && commands.describe(active.key)?.markdown === original) commands.delete(active.key);
      close();
    } catch {
      setError('无法访问剪贴板，内容已保留。');
    }
  };
  const page = (next: Extract<Menu, { phase: 'open' }>['page']) => {
    setMenu({ phase: 'open', anchor: active, page: next });
    setQuery('');
  };
  const types = BLOCK_TYPES.filter(
    ([type, label]) =>
      (menu.phase !== 'open' ||
        menu.page !== 'convert' ||
        [
          'paragraph',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'bullet',
          'number',
          'quote',
          'code',
        ].includes(type)) &&
      (description.executable || !['code', 'raw', 'agent'].includes(type)) &&
      `${type} ${label}`.toLowerCase().includes(query.toLowerCase())
  );
  return createPortal(
    <>
      <div
        ref={controls}
        className="notebook-block-controls"
        style={{ left: active.left, top: active.top }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <button aria-label="在块下方插入" onClick={() => open(active, 'insert')}>
          <Plus size={15} />
        </button>
        <button
          aria-label="块操作，拖动以排序"
          data-drag-handle="true"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              phase: 'pressed',
              key: active.key,
              source: description.markdown,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onClick={(event) => {
            if (event.detail === 0) open(active);
          }}
        >
          <GripVertical size={15} />
        </button>
      </div>
      {menu.phase === 'open' && (
        <div
          ref={panel}
          className="notebook-block-menu"
          role="dialog"
          aria-label="块操作"
          style={{
            visibility: 'hidden',
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
              editor.focus();
            }
            if (
              ['ArrowDown', 'ArrowUp'].includes(event.key) &&
              !(event.target instanceof HTMLInputElement)
            ) {
              event.preventDefault();
              const items = Array.from(
                panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
              );
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              items[
                (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
              ]?.focus();
            }
          }}
        >
          {menu.page !== 'actions' && (
            <button onClick={() => page('actions')}>
              <ChevronLeft size={15} />
              返回块操作
            </button>
          )}
          {menu.page === 'actions' ? (
            <>
              <button onClick={() => run(() => commands.duplicate(active.key))}>
                <Copy size={15} />
                创建副本
              </button>
              <button onClick={() => void copy()}>
                <Copy size={15} />
                复制 Markdown
              </button>
              <button onClick={() => void copy(true)}>
                <Scissors size={15} />
                剪切
              </button>
              <div className="notebook-block-menu-divider" />
              <button onClick={() => page('insert')}>
                <Plus size={15} />
                在下方插入…
              </button>
              <button onClick={() => run(() => commands.insert(active.key, 'paragraph', false))}>
                <ArrowUpToLine size={15} />
                在上方插入段落
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(commands.link(active.key));
                    close();
                  } catch {
                    setError('无法复制块链接。');
                  }
                }}
              >
                <Link2 size={15} />
                复制块链接
              </button>
              <div className="notebook-block-menu-divider" />
              <button disabled={!description.rich} onClick={() => page('convert')}>
                <Type size={15} />
                转换为…
              </button>
              <button
                disabled={!description.rich}
                onClick={() =>
                  run(() =>
                    commands.decorate(active.key, {
                      kind: 'callout',
                      title: '提示',
                      collapsed: false,
                    })
                  )
                }
              >
                <MessageSquare size={15} />
                提示块
              </button>
              <button
                disabled={!description.rich}
                onClick={() =>
                  run(() =>
                    commands.decorate(active.key, {
                      kind: 'toggle',
                      title: '详情',
                      collapsed: false,
                    })
                  )
                }
              >
                <ChevronsUpDown size={15} />
                折叠块
              </button>
              <button disabled={!description.rich} onClick={() => page('columns')}>
                <Columns3 size={15} />
                分栏…
              </button>
              <button disabled={!description.rich} onClick={() => page('colors')}>
                <Palette size={15} />
                文字与背景颜色…
              </button>
              <div className="notebook-block-menu-divider" />
              <button onClick={() => run(() => commands.delete(active.key))}>
                <Trash2 size={15} />
                删除块
              </button>
              {description.metadata && (
                <input
                  aria-label="块标题"
                  defaultValue={description.metadata.title ?? ''}
                  key={active.key}
                  onBlur={(event) => commands.decorate(active.key, { title: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commands.decorate(active.key, { title: event.currentTarget.value });
                      close();
                    }
                  }}
                />
              )}
              <small>{description.characters} 字符</small>
            </>
          ) : menu.page === 'insert' || menu.page === 'convert' ? (
            <>
              <input
                aria-label="搜索块类型"
                placeholder="搜索块类型…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {types.map(([type, label]) => (
                <button
                  key={type}
                  onClick={() =>
                    run(() =>
                      menu.page === 'insert'
                        ? commands.insert(active.key, type as BlockType)
                        : commands.convert(active.key, type as BlockType)
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </>
          ) : menu.page === 'columns' ? (
            <>
              {[2, 3, 4].map((count) => (
                <button key={count} onClick={() => run(() => commands.columns(active.key, count))}>
                  {count} 栏
                </button>
              ))}
            </>
          ) : (
            <>
              <label>
                文字颜色
                <input
                  type="color"
                  aria-label="块文字颜色"
                  defaultValue={description.metadata?.foreground ?? '#37352f'}
                  onInput={(event) =>
                    commands.decorate(active.key, { foreground: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                背景颜色
                <input
                  type="color"
                  aria-label="块背景颜色"
                  defaultValue={description.metadata?.background ?? '#f3f2ee'}
                  onInput={(event) =>
                    commands.decorate(active.key, { background: event.currentTarget.value })
                  }
                />
              </label>
              <button
                onClick={() =>
                  run(() => commands.decorate(active.key, { foreground: null, background: null }))
                }
              >
                重置颜色
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {drop && (
        <div
          className="notebook-block-drop"
          style={{ left: drop.left, top: drop.top, width: drop.width }}
        />
      )}
    </>,
    document.body
  );
}
