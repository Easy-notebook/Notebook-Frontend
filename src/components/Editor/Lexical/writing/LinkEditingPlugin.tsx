import { validWritingLink } from './WritingLinks';
import { $textBoundedSelection } from './ProseSelection';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $getNodeByKey,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  type RangeSelection,
} from 'lexical';
import { $toggleLink, $isLinkNode } from '@lexical/link';
import { mergeRegister } from '@lexical/utils';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
export function LinkEditingPlugin() {
  const session = useNotebookEditorSession();
  const [draft, setDraft] = useState<{
      selection: RangeSelection;
      text: string;
      url: string;
    } | null>(null),
    [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const open = draft !== null;
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(
    () =>
      mergeRegister(
        session.editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            if (
              !(event.metaKey || event.ctrlKey) ||
              event.key.toLowerCase() !== 'k' ||
              !session.editor.isEditable() ||
              event.isComposing
            )
              return false;
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return false;
            const parent = selection.anchor.getNode().getParent();
            if (selection.isCollapsed() && !$isLinkNode(parent)) return false;
            event.preventDefault();
            setError('');
            const bounded = $textBoundedSelection(selection) ?? selection.clone();
            setDraft({
              selection: bounded,
              text: bounded.getTextContent(),
              url: $isLinkNode(parent) ? parent.getURL() : 'https://',
            });
            return true;
          },
          COMMAND_PRIORITY_HIGH
        ),
        session.editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            if (
              !session.editor.isEditable() ||
              !(event instanceof ClipboardEvent) ||
              !event.clipboardData
            )
              return false;
            const selection = $getSelection(),
              url = event.clipboardData.getData('text/plain').trim();
            if (!$isRangeSelection(selection) || selection.isCollapsed() || !validWritingLink(url))
              return false;
            event.preventDefault();
            $toggleLink(url);
            return true;
          },
          COMMAND_PRIORITY_HIGH
        )
      ),
    [session]
  );
  if (!draft) return null;
  const apply = (url: string | null) => {
    if (!session.owns() || !session.editor.isEditable()) return;
    if (url !== null && !validWritingLink(url)) {
      setError('请输入 http(s)、mailto、相对路径或文档锚点链接。');
      return;
    }
    session.editor.update(
      () => {
        if (
          !$getNodeByKey(draft.selection.anchor.key)?.isAttached() ||
          !$getNodeByKey(draft.selection.focus.key)?.isAttached() ||
          draft.selection.getTextContent() !== draft.text
        ) {
          setError('原文已变化，请重新选择文字。');
          return;
        }
        $setSelection(draft.selection);
        $toggleLink(url);
        setDraft(null);
        session.editor.focus();
      },
      { discrete: true, tag: HISTORY_PUSH_TAG }
    );
  };
  return createPortal(
    <div
      className="notebook-link-dialog"
      role="dialog"
      aria-label="编辑链接"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          setDraft(null);
          session.editor.focus();
        }
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft.url.trim());
        }}
      >
        <label>
          链接地址
          <input
            ref={input}
            aria-label="链接地址"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {validWritingLink(draft.url) && (
          <a href={draft.url} target="_blank" rel="noopener noreferrer">
            打开链接
          </a>
        )}
        <button type="submit">应用链接</button>
        <button type="button" onClick={() => apply(null)}>
          移除链接
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            session.editor.focus();
          }}
        >
          取消
        </button>
      </form>
    </div>,
    document.body
  );
}
