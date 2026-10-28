import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { COMMAND_PRIORITY_HIGH, KEY_TAB_COMMAND, KEY_ESCAPE_COMMAND } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import type { AgentProvider } from '@Services/agent-cell/protocol';
import { WritingCompletion } from './WritingCompletion';
import { useEditorSurface } from './useEditorSurface';
export function WritingCompletionPlugin() {
  const session = useNotebookEditorSession(),
    readOnly = useEditorReadOnly(),
    host = useEditorSurface(session.editor);
  const completion = useMemo(() => new WritingCompletion(session), [session]);
  const state = useSyncExternalStore(completion.subscribe, completion.snapshot);
  const [enabled, setEnabled] = useState(false),
    [provider, setProvider] = useState<AgentProvider>('claude');
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(
    null
  );
  useEffect(() => () => completion.dispose(), [completion]);
  useEffect(() => {
    if (!enabled || readOnly) {
      completion.cancel();
      return;
    }
    const root = session.editor.getRootElement();
    const refresh = () => {
      if (!root?.contains(document.activeElement)) {
        completion.cancel();
        return;
      }
      completion.refresh(provider);
    };
    const composing = () => completion.cancel();
    root?.addEventListener('compositionstart', composing);
    root?.addEventListener('focusout', composing);
    const cleanup = mergeRegister(
      session.editor.registerUpdateListener(refresh),
      session.editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (!event || event.shiftKey || !completion.$accept()) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      session.editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (completion.snapshot().phase === 'idle') return false;
          completion.dismiss();
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
    return () => {
      cleanup();
      root?.removeEventListener('compositionstart', composing);
      root?.removeEventListener('focusout', composing);
      completion.cancel();
    };
  }, [session, completion, enabled, provider, readOnly]);
  useEffect(() => {
    if (state.phase !== 'suggested' || !host) {
      setPosition(null);
      return;
    }
    const locate = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const caret = selection.getRangeAt(0).getBoundingClientRect(),
        box = host.getBoundingClientRect();
      if (caret.height)
        setPosition({
          left: caret.right - box.left,
          top: caret.top - box.top + host.scrollTop,
          width: Math.max(80, box.right - caret.right - 24),
        });
    };
    locate();
    window.addEventListener('scroll', locate, true);
    window.addEventListener('resize', locate);
    return () => {
      window.removeEventListener('scroll', locate, true);
      window.removeEventListener('resize', locate);
    };
  }, [state, host]);
  if (!host || readOnly) return null;
  return createPortal(
    <>
      <div className="notebook-completion-controls">
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          停笔续写
        </label>
        {enabled && (
          <select
            aria-label="续写模型"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AgentProvider)}
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        )}
        {state.phase === 'running' && <span role="status">正在续写…</span>}
        {state.error && <span role="alert">{state.error}</span>}
      </div>
      {position && state.phase === 'suggested' && (
        <span className="notebook-completion-ghost" style={position} aria-label="续写建议">
          <span>{state.text}</span>
          <small>Tab 接受 · Esc 取消</small>
        </span>
      )}
    </>,
    host
  );
}
