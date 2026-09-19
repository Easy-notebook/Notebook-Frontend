import { EditorState, Transaction } from '@codemirror/state';
import { history, historyField } from '@codemirror/commands';
import { codeFolding, foldState } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { textReplacement } from '@Utils/textReplacement';

const fields = { history: historyField, folds: foldState };

/** Serializable editing state only: never retain a detached view or its callback configuration. */
export class CodeEditorSession {
  private json?: ReturnType<EditorState['toJSON']>;
  private scroll = { top: 0, left: 0 };
  height?: number;

  capture(view: EditorView): void {
    this.json = view.state.toJSON(fields);
    const height = view.dom.getBoundingClientRect().height;
    if (height > 0) this.height = height;
    this.scroll = { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft };
  }

  initialState(value: string) {
    if (!this.json) return undefined;
    const previous = this.json.doc as string;
    if (previous !== value) {
      const state = EditorState.fromJSON(
        this.json,
        { extensions: [history(), codeFolding(), EditorState.allowMultipleSelections.of(true)] },
        fields
      );
      this.json = state
        .update({
          changes: textReplacement(previous, value),
          annotations: Transaction.addToHistory.of(false),
        })
        .state.toJSON(fields);
    }
    return { json: this.json, fields };
  }

  restoreScroll(view: EditorView): void {
    const saved = this.scroll;
    view.requestMeasure({
      read: () => saved,
      write: ({ top, left }) => {
        view.scrollDOM.scrollTop = top;
        view.scrollDOM.scrollLeft = left;
      },
    });
    this.json = undefined;
  }

  release(): void {
    this.json = undefined;
  }
}
