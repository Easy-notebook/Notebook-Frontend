import { useDraftPlayback } from './useDraftPlayback';
import { NotebookMarkdownPreview } from '../components/NotebookMarkdownPreview';
import { formatCodeFence } from '@Utils/markdown/fencedMarkdown';
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import useStore from '@Store/notebookStore';
import {
  agentWriting,
  focusedWritingIds,
  type WritingOperation,
  type WritingApproval,
} from '@Services/agent-writing/AgentWriting';
import type { LexicalEditor } from 'lexical';
import { Check, X } from 'lucide-react';
import '../../../AgentVisuals/agent-visuals.css';
import './agent-writing.css';

function CursorApproval({ approval }: { approval: WritingApproval }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const decide = (decision: 'approve' | 'reject') => {
    try {
      approval.resolve(decision);
      setSubmitted(true);
    } catch (failure) {
      setError(String(failure));
    }
  };
  return (
    <span
      className="av-theme av-dialog-actions agent-cursor-approval"
      role="group"
      aria-label="审批当前草稿"
    >
      <button type="button" disabled={submitted} onClick={() => decide('approve')}>
        <Check size={14} aria-hidden="true" />
        批准
      </button>
      <button type="button" disabled={submitted} onClick={() => decide('reject')}>
        <X size={14} aria-hidden="true" />
        拒绝
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

/** Decorations live outside contenteditable: no ghost text enters serialization or undo. */
function WritingDecoration({
  operation,
  editor,
  focused,
}: {
  operation: WritingOperation;
  editor: LexicalEditor;
  focused: boolean;
}) {
  const cell = useStore((state) => state.cells.find((item) => item.id === operation.cellId));
  // A planned edit with an intent owns the current node while the agent thinks.
  // Untouched outline reservations and completed drafts awaiting approval stay static.
  const thinking =
    operation.phase === 'proposed' && !!operation.intent && operation.draft === undefined;
  const draftSource = operation.draft ?? cell?.content;
  const replacesText = cell?.type === 'markdown' || cell?.type === 'hybrid' || cell?.type === 'raw';
  const playback = useDraftPlayback(
    operation.id,
    draftSource ?? '',
    operation.phase !== 'proposed'
  );
  const overlay = useRef<HTMLDivElement>(null);
  const draft = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = draft.current;
    const cursor = caret.current;
    const content = container?.querySelector('.agent-markdown-preview, pre');
    if (!container || !cursor || !content) return;
    const positionCaret = () => {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let last: Node | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.length) last = node;
      }
      const range = document.createRange();
      if (last) {
        range.selectNodeContents(last);
        range.collapse(false);
      }
      const rect = last ? range.getBoundingClientRect() : content.getBoundingClientRect();
      const parent = container.getBoundingClientRect();
      cursor.style.left = `${rect.right - parent.left + container.scrollLeft + 2}px`;
      cursor.style.top = `${rect.top - parent.top + container.scrollTop}px`;
      cursor.style.height = `${rect.height || 20}px`;
    };
    const resize = new ResizeObserver(positionCaret);
    resize.observe(content);
    const mutations = new MutationObserver(positionCaret);
    mutations.observe(content, { childList: true, subtree: true, characterData: true });
    positionCaret();
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [operation.draft, focused]);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const root = editor.getRootElement();
  const host = root?.parentElement;
  useLayoutEffect(() => {
    if (!root || !host) return;
    let target: HTMLElement | undefined;
    let frame = 0;
    const clear = () => {
      target?.classList.remove(
        'agent-writing-target',
        'agent-outline-target',
        'agent-preview-target'
      );
      target?.style.removeProperty('--agent-writing-space');
      target?.removeAttribute('data-agent-locked');
      target?.removeAttribute('aria-busy');
    };
    const layout = () => {
      const next = Array.from(root.children).find(
        (element) => (element as HTMLElement).dataset.cellId === operation.cellId
      ) as HTMLElement | undefined;
      if (next !== target) {
        clear();
        target = next;
      }
      if (!target || !overlay.current) return;
      target.classList.add('agent-writing-target');
      target.classList.toggle('agent-outline-target', !!operation.outline);
      target.classList.toggle('agent-preview-target', replacesText && draftSource !== undefined);
      target.dataset.agentLocked = operation.name;
      target.setAttribute(
        'aria-busy',
        String(focused && (thinking || operation.phase !== 'proposed'))
      );
      const space = `${overlay.current.offsetHeight + (operation.approval && focused ? 40 : replacesText ? 0 : 30)}px`;
      if (target.style.getPropertyValue('--agent-writing-space') !== space)
        target.style.setProperty('--agent-writing-space', space);
      const rect = target.getBoundingClientRect(),
        parent = host.getBoundingClientRect();
      const nextPosition = {
        top: rect.top - parent.top + host.scrollTop + (replacesText ? 0 : 24),
        left: rect.left - parent.left + host.scrollLeft,
        width: rect.width,
      };
      setPosition((old) =>
        old.top === nextPosition.top &&
        old.left === nextPosition.left &&
        old.width === nextPosition.width
          ? old
          : nextPosition
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    if (overlay.current) resize.observe(overlay.current);
    const detach = editor.registerUpdateListener(schedule);
    layout();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      detach();
      clear();
    };
  }, [editor, root, host, operation, thinking, focused, replacesText, draftSource]);
  if (!host) return null;
  const waitingOutline =
    !!operation.outline &&
    !operation.intent &&
    operation.phase === 'proposed' &&
    !operation.approval;
  const active = focused && (thinking || operation.phase !== 'proposed' || playback.revealing);
  return createPortal(
    <div
      ref={overlay}
      className={`agent-writing-decoration${replacesText ? ' agent-writing-decoration--inplace' : ''}`}
      data-agent-operation={operation.id}
      data-writing-phase={operation.phase}
      data-writing-cell={operation.cellId}
      style={
        {
          ...position,
          '--agent-color': operation.color,
          visibility: position.width ? 'visible' : 'hidden',
        } as CSSProperties
      }
      contentEditable={false}
    >
      {focused && !waitingOutline && draftSource === undefined && (
        <span className="agent-writing-caret">
          <span className="agent-writing-name">{operation.name}</span>
          {operation.approval && <CursorApproval approval={operation.approval} />}
        </span>
      )}
      {draftSource !== undefined && (
        <div ref={draft} className="agent-writing-draft">
          {cell?.type === 'raw' ? (
            <pre className={active ? 'agent-shiny-text' : ''}>{playback.text}</pre>
          ) : (
            <NotebookMarkdownPreview
              source={
                cell?.type === 'code'
                  ? formatCodeFence(playback.text, cell.language || '')
                  : playback.text
              }
              active={active}
              title={
                root?.querySelector<HTMLElement>(`[data-cell-id="${CSS.escape(operation.cellId)}"]`)
                  ?.dataset.type === 'title'
              }
              className={root?.className}
            />
          )}
          {focused && !waitingOutline && (
            <span ref={caret} className="agent-writing-caret agent-writing-caret--inline">
              <span className="agent-writing-name">{operation.name}</span>
              {operation.approval && <CursorApproval approval={operation.approval} />}
            </span>
          )}
        </div>
      )}
    </div>,
    host
  );
}
export function AgentWritingPlugin() {
  const [editor] = useLexicalComposerContext();
  const notebookId = useStore((state) => state.notebookId);
  const operations = useSyncExternalStore(
    agentWriting.subscribe,
    agentWriting.snapshot,
    agentWriting.snapshot
  );
  const focused = focusedWritingIds(operations);
  return (
    <>
      {operations
        .filter((operation) => operation.notebookId === notebookId)
        .map((operation) => (
          <WritingDecoration
            key={operation.id}
            operation={operation}
            editor={editor}
            focused={focused.has(operation.id)}
          />
        ))}
    </>
  );
}
