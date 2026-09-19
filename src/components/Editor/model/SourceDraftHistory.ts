import { EditorState, Transaction } from '@codemirror/state';
import { history, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { textReplacement } from '@Utils/textReplacement';

/** Local source-buffer history. Retains inverse changes, not full snapshots per key. */
export class SourceDraftHistory {
  private state: EditorState;
  private value: string;
  private previousKind: 'delete' | 'input' | undefined;

  constructor(source: string) {
    this.value = source;
    this.state = EditorState.create({ doc: source, extensions: [history()] });
  }

  get source() {
    return this.value;
  }
  get canUndo() {
    return undoDepth(this.state) > 0;
  }
  get canRedo() {
    return redoDepth(this.state) > 0;
  }
  get selection() {
    return this.state.selection.main;
  }

  select(start: number, end: number, backward = false) {
    const anchor = backward ? end : start;
    const head = backward ? start : end;
    if (this.selection.anchor === anchor && this.selection.head === head) return;
    this.state = this.state.update({
      selection: { anchor, head },
      annotations: [Transaction.addToHistory.of(false), isolateHistory.of('full')],
    }).state;
    this.previousKind = undefined;
  }

  edit(value: string, start: number, end: number, backward = false, isolated = false) {
    const previous = this.value;
    if (value === previous) {
      this.select(start, end, backward);
      return;
    }
    const change = textReplacement(previous, value);
    this.apply(value, change.from, change.to, change.insert, start, end, backward, isolated);
  }

  /** Known-range commands need no full-buffer prefix/suffix search. */
  replace(from: number, to: number, insert: string, start: number, end: number, backward = false, isolated = true) {
    if (this.value.slice(from, to) === insert) {
      this.select(start, end, backward);
      return;
    }
    const value = this.value.slice(0, from) + insert + this.value.slice(to);
    this.apply(value, from, to, insert, start, end, backward, isolated);
  }

  private apply(
    value: string,
    from: number,
    to: number,
    insert: string,
    start: number,
    end: number,
    backward: boolean,
    isolated: boolean
  ) {
    const deletion = insert.length === 0 && to > from;
    // Replacing a selection is discrete, including a diff trimmed to its changed interior.
    const isolate = isolated || (!this.selection.empty &&
      from >= this.selection.from && to <= this.selection.to);
    const kind = deletion ? 'delete' : 'input';
    const boundary = isolate ? 'full' : this.previousKind && this.previousKind !== kind ? 'before' : undefined;
    this.state = this.state.update({
      changes: { from, to, insert },
      selection: { anchor: backward ? end : start, head: backward ? start : end },
      annotations: [
        Transaction.userEvent.of(deletion ? 'delete' : isolated ? 'input' : 'input.type'),
        ...(boundary ? [isolateHistory.of(boundary)] : []),
      ],
    }).state;
    this.value = value;
    this.previousKind = isolate ? undefined : kind;
  }

  step(backward: boolean): boolean {
    return (backward ? undo : redo)({
      state: this.state,
      dispatch: (transaction) => {
        this.state = transaction.state;
        this.value = this.state.doc.toString();
        this.previousKind = undefined;
      },
    });
  }
}
