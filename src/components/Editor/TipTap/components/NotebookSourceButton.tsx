import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import useStore from '@Store/notebookStore';
import { NotebookSourceSession } from '../../model/NotebookSourceSession';
import { applyNotebookSource } from '../model/applyNotebookSource';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { SourceDraftHistory } from '../../model/SourceDraftHistory';
import { indentSourceChange } from '../../utils/sourceIndentation';
import { isCompositionInput } from '../../utils/compositionInput';
import { sourceInputChange } from '../../utils/sourceInputChange';
import {
  notebookSourceDrafts,
  type NotebookSourceDraft,
} from '../../model/NotebookSourceDraftRegistry';

export function NotebookSourceButton({ editor }: { editor: Editor }) {
  const readOnly = useEditorReadOnly();
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<NotebookSourceDraft | null>(null);
  const session = draft?.session ?? null;
  useEffect(() => {
    if (!draft) return;
    notebookSourceDrafts.attach(draft);
    return () => notebookSourceDrafts.detach(draft);
  }, [draft]);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        hidden={readOnly}
        disabled={session !== null}
        className="text-sm px-2 py-1"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (session || readOnly || editor.isDestroyed || !editor.isEditable) return;
          try {
            const store = useStore.getState();
            setDraft(notebookSourceDrafts.open(store.notebookId, store.cells));
            setError(null);
          } catch (failure) {
            setError(String(failure));
          }
        }}
      >
        Notebook source
      </button>
      {error && <span role="alert">{error}</span>}
      {draft && session && (
        <NotebookSourceDialog
          session={session}
          draftHistory={draft.history}
          editor={editor}
          close={() => {
            notebookSourceDrafts.release(draft);
            setDraft(null);
          }}
          restoreFocus={() => trigger.current?.focus()}
        />
      )}
    </>
  );
}

function NotebookSourceDialog({
  session,
  draftHistory,
  editor,
  close,
  restoreFocus,
}: {
  session: NotebookSourceSession;
  draftHistory: SourceDraftHistory;
  editor: Editor;
  close: () => void;
  restoreFocus: () => void;
}) {
  const readOnly = useEditorReadOnly();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const insertionCursor = useRef<number | null>(null);
  const composing = useRef(false);
  const [source, setSource] = useState(session.source);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const element = input.current;
    const cursor = insertionCursor.current;
    if (!element || cursor === null) return;
    insertionCursor.current = null;
    element.focus({ preventScroll: true });
    element.setSelectionRange(cursor, cursor);
    element.scrollTop = element.scrollHeight;
  }, [source]);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    return () => {
      element.close();
      restoreFocus();
    };
  }, []);
  const canEditDraft = useCallback(
    () => !readOnly && !editor.isDestroyed && editor.isEditable,
    [readOnly, editor]
  );
  const cancel = () => {
    session.cancel();
    close();
  };
  const publishDraft = useCallback(() => {
    session.edit(draftHistory.source);
    setSource(draftHistory.source);
    setError(null);
  }, [session, draftHistory]);
  const restoreDraftSelection = useCallback(() => {
    const element = input.current;
    if (!element) return;
    const selection = draftHistory.selection;
    element.setRangeText(draftHistory.source, 0, element.value.length, 'preserve');
    element.setSelectionRange(
      selection.from,
      selection.to,
      selection.anchor > selection.head ? 'backward' : 'forward'
    );
    publishDraft();
  }, [draftHistory, publishDraft]);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const beforeInput = (event: InputEvent) => {
      if (!canEditDraft()) { event.preventDefault(); return; }
      if (composing.current || event.isComposing) return;
      draftHistory.select(
        element.selectionStart,
        element.selectionEnd,
        element.selectionDirection === 'backward'
      );
      const change = sourceInputChange(event, element.selectionStart, element.selectionEnd);
      if (change) {
        event.preventDefault();
        const { from, to, insert, cursor, isolated } = change;
        draftHistory.replace(from, to, insert, cursor, cursor, false, isolated);
        element.setRangeText(insert, from, to, 'end');
        publishDraft();
        return;
      }
      if (
        !event.cancelable ||
        (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo')
      )
        return;
      // Native edit-menu history must use the same owner as keyboard history.
      event.preventDefault();
      event.stopPropagation();
      if (draftHistory.step(event.inputType === 'historyUndo')) restoreDraftSelection();
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, [draftHistory, restoreDraftSelection, canEditDraft, publishDraft]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="notebook-source-title"
      className="rounded-lg border border-gray-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-5"
      style={{ width: 'min(1000px, 90vw)', maxHeight: '90vh' }}
      // Draft editing owns its native keyboard history until Apply. Notebook
      // shortcuts must not undo or mutate the live document behind this modal.
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        if (composing.current) return;
        cancel();
      }}
    >
      <h2 id="notebook-source-title" className="text-lg font-semibold">
        Notebook source
      </h2>
      <p id="notebook-source-help" className="text-sm my-2">
        Keep the boundary comments intact. Move or remove complete sections to reorder or delete
        cells. Outputs stay outside this source buffer.
      </p>
      <div className="flex flex-wrap gap-2 my-2">
        {(['markdown', 'code', 'raw'] as const).map((type) => (
          <button
            key={type}
            type="button"
            disabled={!canEditDraft()}
            className="border rounded px-2 py-1"
            onClick={() => {
              if (composing.current || !canEditDraft()) return;
              try {
                const previousLength = draftHistory.source.length;
                insertionCursor.current = session.appendCell(type);
                draftHistory.replace(
                  previousLength,
                  previousLength,
                  session.source.slice(previousLength),
                  insertionCursor.current,
                  insertionCursor.current
                );
                publishDraft();
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : String(failure));
              }
            }}
          >
            Add {type === 'code' ? 'Python' : type}
          </button>
        ))}
        {([true, false] as const).map((backward) => (
          <button
            key={backward ? 'undo' : 'redo'}
            type="button"
            aria-label={backward ? 'Undo draft' : 'Redo draft'}
            disabled={!canEditDraft() || (backward ? !draftHistory.canUndo : !draftHistory.canRedo)}
            className="border rounded px-2 py-1 disabled:opacity-40"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (composing.current || !canEditDraft()) return;
              if (draftHistory.step(backward)) {
                restoreDraftSelection();
                input.current?.focus({ preventScroll: true });
              }
            }}
          >
            {backward ? 'Undo' : 'Redo'}
          </button>
        ))}
      </div>
      <textarea
        ref={input}
        aria-label="Notebook source"
        aria-describedby="notebook-source-help"
        spellCheck={false}
        className="w-full border rounded p-3 font-mono text-sm bg-transparent"
        style={{ height: '55vh', tabSize: 2 }}
        value={source}
        readOnly={!canEditDraft()}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onSelect={(event) => {
          const element = event.currentTarget;
          draftHistory.select(
            element.selectionStart,
            element.selectionEnd,
            element.selectionDirection === 'backward'
          );
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (
            !canEditDraft() ||
            composing.current ||
            isCompositionInput(event.nativeEvent) ||
            event.altKey ||
            !(event.ctrlKey || event.metaKey)
          )
            return;
          const key = event.key.toLowerCase();
          const element = event.currentTarget;
          draftHistory.select(
            element.selectionStart,
            element.selectionEnd,
            element.selectionDirection === 'backward'
          );
          if (key === '[' || key === ']') {
            event.preventDefault();
            const edit = indentSourceChange(
              element.value,
              element.selectionStart,
              element.selectionEnd,
              key === '['
            );
            draftHistory.replace(
              edit.from,
              edit.to,
              edit.insert,
              edit.start,
              edit.end,
              element.selectionDirection === 'backward'
            );
            restoreDraftSelection();
          } else if (key === 'z' || (key === 'y' && event.ctrlKey && !event.metaKey)) {
            event.preventDefault();
            if (draftHistory.step(key === 'z' && !event.shiftKey)) restoreDraftSelection();
          }
        }}
        onChange={(event) => {
          if (!canEditDraft()) return;
          const element = event.currentTarget;
          const inputType = (event.nativeEvent as InputEvent).inputType;
          const isolated =
            inputType === 'insertFromPaste' || inputType === 'insertFromDrop' ||
            inputType === 'insertReplacementText';
          draftHistory.edit(
            element.value,
            element.selectionStart,
            element.selectionEnd,
            element.selectionDirection === 'backward',
            isolated
          );
          publishDraft();
        }}
      />
      {error && (
        <p role="alert" className="text-red-600 my-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 mt-3">
        <button type="button" className="border rounded px-3 py-1" onClick={cancel}>
          Cancel
        </button>
        <button
          type="button"
          className="border rounded px-3 py-1"
          onClick={() => {
            if (composing.current) return;
            const current = useStore.getState();
            if (readOnly || editor.isDestroyed || !editor.isEditable) {
              setError('Editor is not editable');
              return;
            }
            if (
              session.apply(current.notebookId, current.cells, (next) =>
                applyNotebookSource(editor, current.cells, next)
              )
            )
              close();
            else setError(session.error);
          }}
        >
          Apply source
        </button>
      </div>
    </dialog>
  );
}
