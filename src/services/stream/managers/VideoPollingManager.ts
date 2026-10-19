/**
 * Video Polling Manager - Manages video generation status polling
 *
 * Owns per-task polling sessions bound to the notebook that started them.
 */

import useStore from '@Store/notebookStore';
import { networkLog, agentLog } from '@Utils/logger';
import { VideoPollingSession } from './VideoPollingSession';

export interface VideoPollingOptions {
  taskId: string;
  uniqueIdentifier: string;
  commandId?: string;
  prompt?: string;
  maxAttempts?: number;
  pollInterval?: number;
}

export class VideoPollingManager {
  private static instance: VideoPollingManager;
  private readonly activePolls = new Map<string, VideoPollingSession>();
  private readonly DEFAULT_MAX_ATTEMPTS = 60; // Request durations are additional to polling delays.
  private readonly DEFAULT_POLL_INTERVAL = 10000; // 10 seconds

  private constructor() {}

  static getInstance(): VideoPollingManager {
    if (!VideoPollingManager.instance) {
      VideoPollingManager.instance = new VideoPollingManager();
    }
    return VideoPollingManager.instance;
  }

  /**
   * Start polling for video generation status
   */
  async startPolling(options: VideoPollingOptions): Promise<void> {
    const {
      taskId,
      uniqueIdentifier,
      commandId,
      maxAttempts = this.DEFAULT_MAX_ATTEMPTS,
      pollInterval = this.DEFAULT_POLL_INTERVAL,
    } = options;

    const notebookId = useStore.getState().notebookId;
    if (!notebookId) {
      this.stopPolling(taskId);
      networkLog.error('Unable to get notebookId - stopping poll', { taskId });
      return;
    }

    const ownsNotebook = () =>
      this.activePolls.get(taskId) === session && useStore.getState().notebookId === notebookId;
    const session = new VideoPollingSession(maxAttempts, pollInterval, {
      canPoll: ownsNotebook,
      request: async () => {
        const { default: useOperatorStore } = await import('@Store/operatorStore');
        if (!ownsNotebook()) return;
        await useOperatorStore.getState().sendOperation(notebookId, {
          type: 'check_video_generation_status',
          payload: { taskId, uniqueIdentifier, commandId },
        });
      },
      timeout: () => {
        networkLog.warn('Video generation poll timeout', { taskId, attempts: maxAttempts });
        const success = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
          metadata: {
            isGenerating: false,
            generationError: 'Generation timeout',
            generationStatus: 'timeout',
          },
        });
        if (success) agentLog.info('Video generation timeout status updated', { taskId });
      },
      failed: (error) => networkLog.error('Video generation status poll error', { taskId, error }),
      stopped: () => {
        if (this.activePolls.get(taskId) === session) this.activePolls.delete(taskId);
      },
    });
    this.stopPolling(taskId);
    this.activePolls.set(taskId, session);
    networkLog.info('Video generation status polling started', {
      taskId,
      uniqueIdentifier,
      maxAttempts,
    });
  }

  /**
   * Stop polling for a specific task
   */
  stopPolling(taskId: string): void {
    const session = this.activePolls.get(taskId);
    if (session) {
      session.stop();
      networkLog.debug('Video polling stopped', { taskId });
    }
  }

  /**
   * Check if polling is active for a task
   */
  isPolling(taskId: string): boolean {
    return this.activePolls.has(taskId);
  }

  /**
   * Get all active polling task IDs
   */
  getActivePolls(): string[] {
    return Array.from(this.activePolls.keys());
  }

  /**
   * Stop all active polling
   */
  stopAllPolling(): void {
    for (const session of [...this.activePolls.values()]) session.stop();
    networkLog.info('All video polling stopped');
  }
}

export const videoPollingManager = VideoPollingManager.getInstance();
