/**
 * QA Stream Manager - Manages QA streaming state
 *
 * Replaces global lastStreamingQaId with a proper class
 */

import { agentLog } from '@Utils/logger';

export class QAStreamManager {
  private static instance: QAStreamManager;
  private currentStreamingQaId: string | null = null;

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
  setStreamingQaId(qaId: string): void {
    this.currentStreamingQaId = qaId;
    agentLog.debug('QA streaming started', { qaId });
  }

  /**
   * Get the currently streaming QA ID
   */
  getStreamingQaId(): string | null {
    return this.currentStreamingQaId;
  }

  /**
   * Clear the streaming QA ID
   */
  clearStreamingQaId(): void {
    const previousQaId = this.currentStreamingQaId;
    this.currentStreamingQaId = null;
    if (previousQaId) {
      agentLog.debug('QA streaming cleared', { previousQaId });
    }
  }

  /**
   * Check if a QA is currently streaming
   */
  isStreaming(): boolean {
    return this.currentStreamingQaId !== null;
  }
}

export const qaStreamManager = QAStreamManager.getInstance();
