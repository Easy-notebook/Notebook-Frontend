import { $textBoundedSelection } from './ProseSelection';
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type RangeSelection,
} from 'lexical';
import { z } from 'zod';
import type { AgentTransport } from '@Services/agent-cell/AgentTransport';
import { WritingModelClient } from './WritingModelClient';
import type { AgentProvider } from '@Services/agent-cell/protocol';
import useStore from '@Store/notebookStore';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
import type { NotebookEditorSession } from '../interaction/NotebookEditorSession';
const suggestionSchema = z.object({ text: z.string().max(100000), reason: z.string().max(4000) });
export type WritingSuggestion = {
  phase: 'idle' | 'running' | 'proposed' | 'applied' | 'rejected' | 'cancelled' | 'failed';
  original: string;
  replacement: string;
  reason: string;
  error?: string;
};
const initial: WritingSuggestion = { phase: 'idle', original: '', replacement: '', reason: '' };
export class WritingAssistant {
  private state: WritingSuggestion = initial;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private selection: RangeSelection | null = null;
  private baseline: { cellId: string; source: string } | null = null;
  private readonly model: WritingModelClient;
  constructor(
    private readonly session: NotebookEditorSession,
    transport?: AgentTransport
  ) {
    this.model = new WritingModelClient(transport);
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: WritingSuggestion) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  capture() {
    if (!this.session.owns() || !this.session.editor.isEditable()) return false;
    return this.session.editor.read(() => {
      const raw = $getSelection();
      if (!$isRangeSelection(raw) || raw.isCollapsed()) return false;
      const selected = $textBoundedSelection(raw);
      if (!selected) return false;
      const cell = $cellAncestor(selected.anchor.getNode());
      if (!(cell instanceof NotebookCellNode) || $cellAncestor(selected.focus.getNode()) !== cell)
        return false;
      const current = useStore.getState().cells.find((c) => c.id === cell.getCellId());
      if (!current) return false;
      this.abort?.abort();
      this.abort = null;
      this.selection = selected.clone();
      this.baseline = { cellId: current.id, source: current.content };
      this.publish({ ...initial, original: selected.getTextContent() });
      return true;
    });
  }
  async request(instruction: string, provider: AgentProvider) {
    if (
      !this.selection ||
      !this.baseline ||
      !this.session.owns() ||
      !this.session.editor.isEditable() ||
      !instruction.trim()
    )
      return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.publish({
      ...this.state,
      phase: 'running',
      error: undefined,
      replacement: '',
      reason: '',
    });
    try {
      const result = suggestionSchema.parse(
        await this.model.generate(
          {
            notebookId: this.session.notebookId!,
            cellId: this.baseline.cellId,
            provider,
            prompt: `You are a writing reviewer. Return only JSON {"text":"revised plain text","reason":"brief explanation in the user's language"}. Preserve meaning and the original language unless requested. Instruction: ${instruction}\nSelected text:\n${this.state.original}`,
            context: JSON.stringify({
              task: 'writing-proposal',
              cellId: this.baseline.cellId,
              source: this.baseline.source,
            }),
          },
          abort.signal,
          () => this.session.owns()
        )
      );
      if (this.abort !== abort) return;
      this.publish({
        ...this.state,
        phase: 'proposed',
        replacement: result.text,
        reason: result.reason,
      });
    } catch (error) {
      if (this.abort !== abort) return;
      this.publish({
        ...this.state,
        phase: abort.signal.aborted ? 'cancelled' : 'failed',
        error: abort.signal.aborted
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      if (this.abort === abort) this.abort = null;
    }
  }
  accept(text = this.state.replacement) {
    if (
      this.state.phase !== 'proposed' ||
      !this.selection ||
      !this.baseline ||
      !this.session.owns() ||
      !this.session.editor.isEditable()
    )
      return false;
    const current = useStore.getState().cells.find((c) => c.id === this.baseline!.cellId);
    if (current?.content !== this.baseline.source) {
      this.publish({
        ...this.state,
        phase: 'failed',
        error: '原文已变化，提议已保留，请重新选择并生成。',
      });
      return false;
    }
    let applied = false;
    this.session.editor.update(
      () => {
        if (this.selection!.getTextContent() !== this.state.original) return;
        $setSelection(this.selection!);
        this.selection!.insertText(text);
        applied = true;
      },
      { discrete: true, tag: HISTORY_PUSH_TAG }
    );
    if (applied) this.publish({ ...this.state, phase: 'applied' });
    return applied;
  }
  reject() {
    this.abort?.abort();
    this.abort = null;
    this.publish({ ...this.state, phase: 'rejected' });
  }
  cancel() {
    this.abort?.abort();
    this.abort = null;
    this.publish({ ...this.state, phase: 'cancelled' });
  }
  dispose() {
    this.abort?.abort();
    this.abort = null;
    this.listeners.clear();
  }
}
export function sentenceChoices(original: string, replacement: string) {
  const split = (text: string) => text.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) ?? [text];
  const before = split(original),
    after = split(replacement);
  return before.length === after.length
    ? before.map((text, index) => ({ before: text, after: after[index] }))
    : [{ before: original, after: replacement }];
}
