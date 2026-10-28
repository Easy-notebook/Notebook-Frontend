import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  $addUpdateTag,
  type NodeKey,
} from 'lexical';
import { z } from 'zod';
import type { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { $cellAncestor } from '../model/NotebookDocument';
import type { AgentProvider } from '@Services/agent-cell/protocol';
import { WritingModelClient } from './WritingModelClient';
import useStore from '@Store/notebookStore';
export interface CompletionState {
  phase: 'idle' | 'waiting' | 'running' | 'suggested' | 'failed';
  text: string;
  key: NodeKey | null;
  offset: number;
  error?: string;
}
const idle: CompletionState = { phase: 'idle', text: '', key: null, offset: 0 };
interface Context {
  key: NodeKey;
  offset: number;
  cellId: string;
  source: string;
  prefix: string;
}
export class WritingCompletion {
  private state: CompletionState = idle;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private captured: Context | null = null;
  private dismissed: string | null = null;
  constructor(
    private readonly session: NotebookEditorSession,
    private readonly model = new WritingModelClient()
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: CompletionState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  private context(): Context | null {
    return this.session.editor.getEditorState().read(() => this.$context());
  }
  private $context(): Context | null {
    if (
      !this.session.owns() ||
      !this.session.editor.isEditable() ||
      this.session.editor.isComposing()
    )
      return null;
    const selection = $getSelection();
    if (
      !$isRangeSelection(selection) ||
      !selection.isCollapsed() ||
      selection.anchor.type !== 'text'
    )
      return null;
    const node = selection.anchor.getNode(),
      cell = $cellAncestor(node);
    if (
      !$isTextNode(node) ||
      node.hasFormat('code') ||
      !(cell instanceof NotebookCellNode) ||
      cell.isTitle()
    )
      return null;
    const parent = node.getParent();
    if (
      !parent ||
      parent.getType() !== 'paragraph' ||
      node.getNextSibling() ||
      selection.anchor.offset !== node.getTextContentSize()
    )
      return null;
    const prefix = parent.getTextContent();
    if (prefix.trim().length < 4) return null;
    const source = useStore.getState().cells.find((c) => c.id === cell.getCellId())?.content;
    if (source === undefined) return null;
    return {
      key: node.getKey(),
      offset: selection.anchor.offset,
      cellId: cell.getCellId(),
      source,
      prefix,
    };
  }
  refresh(provider: AgentProvider) {
    const context = this.context();
    if (context && this.dismissed === JSON.stringify(context)) return;
    this.dismissed = null;
    if (context && this.captured && JSON.stringify(context) === JSON.stringify(this.captured))
      return;
    this.cancel();
    if (!context) return;
    this.captured = context;
    this.publish({ ...idle, phase: 'waiting', key: context.key, offset: context.offset });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.request(context, provider);
    }, 1200);
  }
  private async request(context: Context, provider: AgentProvider) {
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...this.state, phase: 'running' });
    try {
      const result = z.object({ text: z.string().max(1000) }).parse(
        await this.model.generate(
          {
            notebookId: this.session.notebookId!,
            cellId: context.cellId,
            provider,
            prompt: `Continue the paragraph naturally in the same language. Return JSON {"text":"only the short continuation, without repeating the prefix"}. At most one sentence, no Markdown fences, no commentary. If no continuation is useful return empty text. Paragraph prefix:\n${context.prefix}`,
            context: JSON.stringify({ task: 'writing-completion', source: context.source }),
          },
          abort.signal,
          () => this.session.owns()
        )
      );
      if (this.abort !== abort) return;
      if (JSON.stringify(this.context()) !== JSON.stringify(context)) {
        this.cancel();
        return;
      }
      this.publish({ ...this.state, phase: result.text ? 'suggested' : 'idle', text: result.text });
    } catch (error) {
      if (this.abort === abort && !abort.signal.aborted)
        this.publish({
          ...idle,
          phase: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (this.abort === abort) this.abort = null;
    }
  }
  $accept() {
    if (
      this.state.phase !== 'suggested' ||
      !this.captured ||
      JSON.stringify(this.$context()) !== JSON.stringify(this.captured)
    )
      return false;
    const { key, offset } = this.captured,
      text = this.state.text;
    this.cancel();
    const node = $getNodeByKey(key);
    if (!$isTextNode(node)) return false;
    node.select(offset, offset).insertText(text);
    $addUpdateTag(HISTORY_PUSH_TAG);
    return true;
  }
  dismiss() {
    this.dismissed = JSON.stringify(this.context());
    this.cancel();
  }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    this.captured = null;
    this.publish(idle);
  }
  dispose() {
    this.cancel();
    this.listeners.clear();
  }
}
