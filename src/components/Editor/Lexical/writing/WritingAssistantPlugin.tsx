import { useEditorSurface } from './useEditorSurface';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { WritingAssistant, sentenceChoices } from './WritingAssistant';
import type { AgentProvider } from '@Services/agent-cell/protocol';
export function WritingAssistantPlugin() {
  const session = useNotebookEditorSession(),
    readOnly = useEditorReadOnly();
  const assistant = useMemo(() => new WritingAssistant(session), [session]);
  const state = useSyncExternalStore(assistant.subscribe, assistant.snapshot);
  const [open, setOpen] = useState(false),
    [instruction, setInstruction] = useState('精简这段文字，保留原意。'),
    [provider, setProvider] = useState<AgentProvider>('claude'),
    [error, setError] = useState(''),
    [chosen, setChosen] = useState<boolean[]>([]);
  const choices = useMemo(
    () => sentenceChoices(state.original, state.replacement),
    [state.original, state.replacement]
  );
  useEffect(() => () => assistant.dispose(), [assistant]);
  useEffect(() => setChosen(choices.map(() => true)), [choices]);
  const host = useEditorSurface(session.editor);
  if (!host || readOnly) return null;
  return createPortal(
    <div className="notebook-writing-assistant">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (assistant.capture()) {
            setError('');
            setOpen(true);
          } else {
            setError('请先选择同一正文 cell 内要修改的文字。');
            setOpen(true);
          }
        }}
        aria-label="AI 改写选中文字"
      >
        AI 改写
      </button>
      {open && (
        <section role="dialog" aria-label="AI 书写提议" className="notebook-writing-review">
          <div className="notebook-writing-row">
            <strong>书写提议</strong>
            <select
              aria-label="书写模型"
              value={provider}
              disabled={state.phase === 'running'}
              onChange={(e) => setProvider(e.target.value as AgentProvider)}
            >
              <option value="claude">Claude Code</option>
              <option value="codex">Codex</option>
            </select>
            <button
              onClick={() => {
                assistant.cancel();
                setOpen(false);
              }}
            >
              关闭
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          <textarea
            aria-label="改写要求"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="notebook-writing-row">
            {['精简', '校对', '翻译为英文', '改成正式语气'].map((label) => (
              <button key={label} onClick={() => setInstruction(`${label}这段文字，保留原意。`)}>
                {label}
              </button>
            ))}
          </div>
          {state.phase === 'running' ? (
            <button onClick={() => assistant.cancel()}>取消生成</button>
          ) : (
            <button
              disabled={!state.original}
              onClick={() => void assistant.request(instruction, provider)}
            >
              生成提议
            </button>
          )}
          {state.error && <p role="alert">{state.error}</p>}
          {state.phase === 'proposed' && (
            <>
              <p>{state.reason}</p>
              {choices.map((choice, index) => (
                <label className="notebook-writing-proposal" key={index}>
                  <input
                    type="checkbox"
                    checked={chosen[index] ?? true}
                    onChange={(e) =>
                      setChosen((old) =>
                        old.map((value, i) => (i === index ? e.target.checked : value))
                      )
                    }
                  />
                  <span>
                    <del>{choice.before}</del>
                    <ins>{choice.after}</ins>
                  </span>
                </label>
              ))}
              <button
                onClick={() =>
                  assistant.accept(
                    choices
                      .map((choice, index) => (chosen[index] ? choice.after : choice.before))
                      .join('')
                  )
                }
              >
                接受选中修改
              </button>
              <button onClick={() => assistant.reject()}>拒绝</button>
            </>
          )}
          {state.phase === 'applied' && <p role="status">修改已应用，可用撤销恢复。</p>}
        </section>
      )}
    </div>,
    host
  );
}
