/**
 * QA Stream Manager - Manages QA streaming state
 *
 * Replaces global lastStreamingQaId with a proper class
 */

import { agentLog } from '@Utils/logger';

export interface QAStreamSession {
  readonly qaId: string;
}

export class QAStreamManager {
  private static instance: QAStreamManager;
  private session: QAStreamSession | null = null;
  private detachCancellation: (() => void) | undefined;

  private constructor() {}

  static getInstance(): QAStreamManager {
    if (!QAStreamManager.instance) {
      QAStreamManager.instance = new QAStreamManager();
    }
    return QAStreamManager.instance;
  }

  /**
   * Set the currently streaming QA ID
   */
  setStreamingQaId(qaId: string, signal?: AbortSignal): void {
    signal?.throwIfAborted();
    this.detachCancellation?.();
    this.detachCancellation = undefined;
    const session = Object.freeze({ qaId });
    this.session = session;
    if (signal) {
      const cancel = () => this.clearStreamingQaId(session);
      signal.addEventListener('abort', cancel, { once: true });
      this.detachCancellation = () => signal.removeEventListener('abort', cancel);
    }
    agentLog.debug('QA streaming started', { qaId });
  }

  /**
   * Get the currently streaming QA ID
   */
  getStreamingQaId(): string | null {
    return this.session?.qaId ?? null;
  }

  /** Capture this occurrence, including restarts of the same QA ID. */
  capture(): QAStreamSession | null {
    return this.session;
  }

  /** Clear only the captured occurrence when an owner is provided. */
  clearStreamingQaId(expected?: QAStreamSession | null): void {
    if (expected !== undefined && this.session !== expected) return;
    this.detachCancellation?.();
    this.detachCancellation = undefined;
    const previousQaId = this.session?.qaId;
    this.session = null;
    if (previousQaId) {
      agentLog.debug('QA streaming cleared', { previousQaId });
    }
  }

  /**
   * Check if a QA is currently streaming
   */
  isStreaming(): boolean {
    return this.session !== null;
  }
}

export const qaStreamManager = QAStreamManager.getInstance();
