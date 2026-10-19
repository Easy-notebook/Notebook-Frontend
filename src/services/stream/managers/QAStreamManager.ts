import { agentLog } from '@Utils/logger';

export interface QAStreamSession {
  readonly qaId: string;
}

interface ActiveQAStream {
  readonly session: QAStreamSession;
  readonly signal?: AbortSignal;
  readonly onCancel?: () => void;
  readonly detach: () => void;
}

/** Owns one active answer occurrence and all resources belonging to it. */
export class QAStreamManager {
  private static instance: QAStreamManager;
  private active: ActiveQAStream | null = null;

  private constructor() {}

  static getInstance(): QAStreamManager {
    if (!QAStreamManager.instance) QAStreamManager.instance = new QAStreamManager();
    return QAStreamManager.instance;
  }

  setStreamingQaId(qaId: string, signal?: AbortSignal, onCancel?: () => void): QAStreamSession {
    signal?.throwIfAborted();
    const previous = this.active;
    const session = Object.freeze({ qaId });
    const cancel = () => this.cancelStreamingQa(session);
    this.active = {
      session,
      signal,
      onCancel,
      detach: () => signal?.removeEventListener('abort', cancel),
    };
    signal?.addEventListener('abort', cancel, { once: true });
    previous?.detach();
    try {
      // Publish replacement ownership first: old-answer subscribers may start another answer.
      previous?.onCancel?.();
    } catch (error) {
      this.clearStreamingQaId(session);
      throw error;
    }
    agentLog.debug('QA streaming started', { qaId });
    return session;
  }

  getStreamingQaId(): string | null {
    return this.active?.session.qaId ?? null;
  }

  /** Capture this occurrence, including restarts of the same QA ID. */
  capture(): QAStreamSession | null {
    return this.active?.session ?? null;
  }

  /** Clear only the captured occurrence when an owner is provided. */
  clearStreamingQaId(expected?: QAStreamSession | null): void {
    if (expected !== undefined && this.capture() !== expected) return;
    const previous = this.active;
    this.active = null;
    previous?.detach();
    if (previous) agentLog.debug('QA streaming cleared', { previousQaId: previous.session.qaId });
  }

  /** Interrupt this occurrence, clearing ownership before notifying its answer. */
  cancelStreamingQa(expected: QAStreamSession | null): void {
    if (this.capture() !== expected) return;
    const previous = this.active;
    this.clearStreamingQaId(expected);
    previous?.onCancel?.();
  }

  /** EOF/failure without a finish event interrupts only this transport's answer. */
  endTransport(signal: AbortSignal): void {
    if (this.active?.signal === signal) this.cancelStreamingQa(this.capture());
  }

  isStreaming(): boolean {
    return this.active !== null;
  }
}

export const qaStreamManager = QAStreamManager.getInstance();
