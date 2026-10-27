import type { QAItem } from './agent';

/** Transitions for one answer; only restart may leave a terminal state. */
export class StreamingAnswer {
  constructor(private readonly value: QAItem) {}

  get phase(): 'idle' | 'streaming' | 'completed' | 'interrupted' {
    if (this.value.onProcess) return 'streaming';
    if (this.value.thinkingEndAtMs !== undefined)
      return this.value.resolved ? 'completed' : 'interrupted';
    return 'idle';
  }

  private get terminal(): boolean {
    return this.phase === 'completed' || this.phase === 'interrupted';
  }

  restart(now: number): QAItem {
    return {
      ...this.value,
      type: 'assistant',
      content: '',
      resolved: false,
      onProcess: true,
      thinkingStartAtMs: now,
      thinkingEndAtMs: undefined,
    };
  }

  append(content: string): QAItem {
    if (this.terminal || content === '') return this.value;
    return { ...this.value, content: this.value.content + content };
  }

  complete(response: string | undefined, now: number): QAItem {
    if (this.terminal) return this.value;
    return {
      ...this.value,
      content: this.value.content === '' && response != null ? response : this.value.content,
      resolved: true,
      onProcess: false,
      thinkingEndAtMs: now,
    };
  }

  interrupt(now: number): QAItem {
    if (this.phase !== 'streaming') return this.value;
    return { ...this.value, onProcess: false, thinkingEndAtMs: now };
  }
}
