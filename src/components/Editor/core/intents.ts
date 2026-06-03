/**
 * Typed side-effect channel (Phase 3).
 *
 * Commands in the framework-free core must NOT call `document.querySelector`,
 * `window.prompt`, or dispatch `CustomEvent`s. When a command needs an effect
 * the core cannot perform itself (focus a CodeMirror cell, scroll, prompt the
 * user for a URL, move focus to the next cell), it pushes a typed `EditorIntent`
 * onto an `IntentSink`. The React shell drains the buffered intents after each
 * command run and performs the DOM / persistence work.
 *
 * Framework-free: no prosemirror, no React, no browser globals — pure types +
 * a tiny buffering sink usable in headless tests.
 *
 * See docs/migration/02-command-registry.md §3.1.
 */

/** Effects the core cannot perform itself; drained + executed by the shell. */
export type EditorIntent =
  | { kind: 'focusCell'; cellId: string; place?: 'start' | 'end' }
  | { kind: 'scrollIntoView'; pos: number }
  | { kind: 'openFilePicker'; accept: string; multiple: boolean; token: string }
  | { kind: 'openPrompt'; field: string; token: string }
  | { kind: 'navigateCell'; direction: 'up' | 'down'; fromCellId: string }
  | { kind: 'save' };

export interface IntentSink {
  emit(intent: EditorIntent): void;
}

/**
 * Default buffering sink: commands push intents here, the shell (or a test)
 * calls `drain()` to read + clear them. Deterministic, framework-free.
 */
export class BufferingIntentSink implements IntentSink {
  private buffer: EditorIntent[] = [];

  emit(intent: EditorIntent): void {
    this.buffer.push(intent);
  }

  /** Return + clear all buffered intents. */
  drain(): EditorIntent[] {
    const out = this.buffer;
    this.buffer = [];
    return out;
  }

  /** Read without clearing. */
  peek(): readonly EditorIntent[] {
    return this.buffer;
  }
}
