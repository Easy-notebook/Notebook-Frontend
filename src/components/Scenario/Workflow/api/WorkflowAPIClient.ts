/**
 * Workflow API Client
 * ===================
 *
 * Client for communicating with VDSAgents backend (port 28600)
 *
 * Backend provides three APIs:
 * - POST /planning   - PCS-guided planning (streams action JSON)
 * - POST /generating - Generate actions for behavior execution (returns JSON/stream)
 * - POST /reflecting - Behavior feedback and reflection (streams action JSON)
 *
 * All APIs expect complete StateJSON as request body.
 */

import { StateJSON } from '@Store/models';
import type { WorkflowAPIClientConfig, WorkflowAPIClientPort } from '@Store/models';
import useSettingsStore from '@Store/settingsStore';

/**
 * Workflow API Client Configuration
 */
import { WORKFLOW_API_BASE_URL } from '@/config/base_url';

/**
 * Workflow API Client Configuration
 */
// Config type moved to @Store/models

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WorkflowAPIClientConfig = {
  baseURL: WORKFLOW_API_BASE_URL,
  timeout: 300000, // 5 minutes for streaming
};

/**
 * Workflow API Client
 */
export class WorkflowAPIClient implements WorkflowAPIClientPort {
  private baseURL: string;
  private timeout: number;

  constructor(config: Partial<WorkflowAPIClientConfig> = {}) {
    this.baseURL = config.baseURL || DEFAULT_CONFIG.baseURL;
    this.timeout = config.timeout || DEFAULT_CONFIG.timeout!;

    console.log('[WorkflowAPIClient] Initialized with baseURL:', this.baseURL);
  }

  /**
   * Get current UI language from settings
   * Returns 'en' for English or 'zh' for Chinese (Simplified)
   */
  private getLanguage(): string {
    const settings = useSettingsStore.getState().settings;
    return settings.language || 'en';
  }

  callPlanningAPI(stateJSON: StateJSON, signal?: AbortSignal): AsyncGenerator<unknown> {
    return this.callActions('planning', stateJSON, signal);
  }

  callGeneratingAPI(stateJSON: StateJSON, signal?: AbortSignal): AsyncGenerator<unknown> {
    return this.callActions('generating', stateJSON, signal);
  }

  callReflectingAPI(stateJSON: StateJSON, signal?: AbortSignal): AsyncGenerator<unknown> {
    return this.callActions('reflecting', stateJSON, signal);
  }

  /** The three endpoints share transport ownership and the same line-based action protocol. */
  private async *callActions(
    endpoint: 'planning' | 'generating' | 'reflecting',
    stateJSON: StateJSON,
    cancellation?: AbortSignal
  ): AsyncGenerator<unknown> {
    const timeout = AbortSignal.timeout(this.timeout);
    const signal = cancellation ? AbortSignal.any([cancellation, timeout]) : timeout;
    signal.throwIfAborted();
    const response = await fetch(
      `${this.baseURL}/${endpoint}?lang=${encodeURIComponent(this.getLanguage())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateJSON),
        signal,
      }
    );
    if (signal.aborted) {
      try {
        await response.body?.cancel();
      } finally {
        // A late response still belongs to the cancelled request. Cleanup must
        // not replace the caller's cancellation reason.
        signal.throwIfAborted();
      }
    }
    if (!response.ok) {
      const message = await response.text();
      signal.throwIfAborted();
      throw new Error(`${endpoint} API failed: ${response.status} - ${message}`);
    }
    if (!response.body) throw new Error('Response body is not readable');
    const reader = response.body.getReader();
    let cancellationTask: Promise<void> | undefined;
    const cancel = () => {
      cancellationTask ??= reader.cancel(signal.reason);
      void cancellationTask.catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    let ended = false;
    let failed = false;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        ended = done;
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = done ? '' : lines.pop() || '';
        for (const line of lines) {
          signal.throwIfAborted();
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          const json = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
          let action: unknown;
          try {
            action = JSON.parse(json);
          } catch (error) {
            // Preserve the existing line protocol's treatment of non-JSON metadata lines.
            console.error('[WorkflowAPIClient] Failed to parse action JSON:', json, error);
            continue;
          }
          yield action;
          signal.throwIfAborted();
        }
        if (done) return;
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
      try {
        if (!ended) {
          cancel();
          await cancellationTask?.catch((cleanupError: unknown) => {
            // Preserve the operation failure (including cancellation). If the
            // consumer merely returned early, cleanup is the primary failure.
            if (!failed) throw cleanupError;
          });
        }
      } finally {
        reader.releaseLock();
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      console.error('[WorkflowAPIClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * Update base URL (for switching between dev/prod)
   */
  setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
    console.log('[WorkflowAPIClient] Base URL updated to:', baseURL);
  }
}

/**
 * Global singleton instance
 */
let globalClient: WorkflowAPIClient | null = null;

/**
 * Get or create global API client
 */
export function getWorkflowAPIClient(): WorkflowAPIClient {
  if (!globalClient) {
    globalClient = new WorkflowAPIClient();
  }
  return globalClient;
}

/**
 * Initialize global API client with custom config
 */
export function initializeWorkflowAPIClient(
  config: Partial<WorkflowAPIClientConfig>
): WorkflowAPIClient {
  globalClient = new WorkflowAPIClient(config);
  return globalClient;
}
