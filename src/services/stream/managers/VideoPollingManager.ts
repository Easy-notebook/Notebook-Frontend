/**
 * Video Polling Manager - Manages video generation status polling
 *
 * Replaces global activeVideoPolls Map with a proper class
 */

import useStore from '@Store/notebookStore';
import { networkLog, agentLog } from '@Utils/logger';

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
  private activePolls: Map<string, number> = new Map(); // taskId -> intervalId
  private readonly DEFAULT_MAX_ATTEMPTS = 60; // 60 * 10s = 10 minutes
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

    // Clear existing poll for this task
    this.stopPolling(taskId);

    let attempts = 0;

    const pollIntervalId = setInterval(async () => {
      try {
        attempts++;

        // Get current notebook state
        const notebookState = useStore.getState();
        const notebookId = notebookState.notebookId;

        if (!notebookId) {
          networkLog.error('Unable to get notebookId - stopping poll', { taskId });
          this.stopPolling(taskId);
          return;
        }

        // Send status query to backend
        const { default: useOperatorStore } = await import('@Store/operatorStore');
        const statusCommand = {
          type: 'check_video_generation_status',
          payload: {
            taskId,
            uniqueIdentifier,
            commandId,
          },
        };

        useOperatorStore.getState().sendOperation(notebookId, statusCommand);

        // Check timeout
        if (attempts >= maxAttempts) {
          networkLog.warn('Video generation poll timeout', { taskId, attempts });
          this.stopPolling(taskId);

          // Update cell status to timeout
          const success = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
            metadata: {
              isGenerating: false,
              generationError: 'Generation timeout',
              generationStatus: 'timeout',
            },
          });

          if (success) {
            agentLog.info('Video generation timeout status updated', { taskId });
          }
        }
      } catch (error) {
        networkLog.error('Video generation status poll error', { taskId, error });
        this.stopPolling(taskId);
      }
    }, pollInterval);

    this.activePolls.set(taskId, pollIntervalId);
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
    const intervalId = this.activePolls.get(taskId);
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      this.activePolls.delete(taskId);
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
    this.activePolls.forEach((intervalId) => clearInterval(intervalId));
    this.activePolls.clear();
    networkLog.info('All video polling stopped');
  }
}

export const videoPollingManager = VideoPollingManager.getInstance();
