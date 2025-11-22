/**
 * Workflow API Client
 * ===================
 *
 * Client for communicating with VDSAgents backend (port 28600)
 *
 * Backend provides three APIs:
 * - POST /planning   - PCS-guided planning (returns XML)
 * - POST /generating - Generate actions for behavior execution (returns JSON/stream)
 * - POST /reflecting - Behavior feedback and reflection (returns XML)
 *
 * All APIs expect complete StateJSON as request body.
 */

import { StateJSON } from '@Store/models';
import type { WorkflowAPIClientConfig } from '@Store/models';

/**
 * Workflow API Client Configuration
 */
// Config type moved to @Store/models

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WorkflowAPIClientConfig = {
  baseURL: 'http://localhost:28600',
  timeout: 300000, // 5 minutes for streaming
};

/**
 * Workflow API Client
 */
export class WorkflowAPIClient {
  private baseURL: string;
  private timeout: number;

  constructor(config: Partial<WorkflowAPIClientConfig> = {}) {
    this.baseURL = config.baseURL || DEFAULT_CONFIG.baseURL;
    this.timeout = config.timeout || DEFAULT_CONFIG.timeout!;

    console.log('[WorkflowAPIClient] Initialized with baseURL:', this.baseURL);
  }

  /**
   * Call Planning API (Streaming)
   *
   * Sends complete StateJSON to /planning endpoint.
   * Returns async generator yielding action objects (same format as generating/reflecting).
   *
   * @param stateJSON - Complete state JSON
   * @returns Async generator of action objects
   */
  async *callPlanningAPI(stateJSON: StateJSON): AsyncGenerator<any> {
    const fsmState = stateJSON.state.FSM.state;
    console.log(`[WorkflowAPIClient] ========================================`);
    console.log(`[WorkflowAPIClient] CALLING PLANNING API`);
    console.log(`[WorkflowAPIClient] ========================================`);
    console.log(`[WorkflowAPIClient] FSM State: ${fsmState}`);

    // Log the COMPLETE payload for debugging
    const payload = JSON.stringify(stateJSON, null, 2);
    console.log(`[WorkflowAPIClient] ========== REQUEST PAYLOAD ==========`);
    console.log(`[WorkflowAPIClient] Payload size: ${payload.length} characters`);
    console.log(`[WorkflowAPIClient] Current Location:`, {
      stage_id: stateJSON.observation?.location?.current?.stage_id,
      step_id: stateJSON.observation?.location?.current?.step_id,
      behavior_id: stateJSON.observation?.location?.current?.behavior_id,
    });
    const nb = (stateJSON as any).state?.notebook;
    console.log(`[WorkflowAPIClient] Notebook summary:`, {
      notebook_id: nb?.notebook_id ?? null,
      cell_count: nb?.cell_count ?? 0,
      cells_len: Array.isArray(nb?.cells) ? nb.cells.length : 0,
      last_cell_type: nb?.last_cell_type ?? null,
    });
    console.log(`[WorkflowAPIClient] Variables:`, stateJSON.state?.variables);
    console.log(`[WorkflowAPIClient] FULL PAYLOAD:`);
    console.log(payload);

    try {
      console.log(`[WorkflowAPIClient] Sending request to: ${this.baseURL}/planning`);

      const response = await fetch(`${this.baseURL}/planning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(this.timeout),
      });

      console.log(`[WorkflowAPIClient] ========== RESPONSE RECEIVED ==========`);
      console.log(`[WorkflowAPIClient] Response status: ${response.status} ${response.statusText}`);
      console.log(
        `[WorkflowAPIClient] Response headers:`,
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[WorkflowAPIClient] ERROR RESPONSE:`, errorText);
        throw new Error(`Planning API failed: ${response.status} - ${errorText}`);
      }

      console.log(`[WorkflowAPIClient] ========== PLANNING API STREAMING RESPONSE ==========`);

      // Response is SSE (Server-Sent Events) stream, same format as generating/reflecting
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[WorkflowAPIClient] Planning API stream completed');
            console.log(`[WorkflowAPIClient] ========================================`);
            break;
          }

          // Decode chunk
          const chunk = decoder.decode(value, { stream: true });
          console.log(`[WorkflowAPIClient] RAW STREAM CHUNK (${chunk.length} bytes):`, chunk);
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) {
              // Skip empty lines and comments
              continue;
            }

            // Try to parse as JSON directly first (backend may send raw JSON without "data:" prefix)
            let jsonStr = trimmed;

            // If it's SSE format "data: {...json...}", extract the JSON part
            if (trimmed.startsWith('data:')) {
              jsonStr = trimmed.substring(5).trim();
            }

            // Try to parse JSON
            try {
              const actionData = JSON.parse(jsonStr);
              console.log(
                `[WorkflowAPIClient] PARSED PLANNING ACTION:`,
                JSON.stringify(actionData, null, 2)
              );
              yield actionData;
            } catch (parseError) {
              console.error('[WorkflowAPIClient] Failed to parse planning action JSON:', jsonStr);
              console.error('[WorkflowAPIClient] Parse error:', parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('[WorkflowAPIClient] Planning API error:', error);
      throw error;
    }
  }

  /**
   * Call Generating API (Streaming)
   *
   * Sends complete StateJSON to /generating endpoint.
   * Returns async generator yielding action objects.
   *
   * @param stateJSON - Complete state JSON
   * @returns Async generator of action objects
   */
  async *callGeneratingAPI(stateJSON: StateJSON): AsyncGenerator<any> {
    const fsmState = stateJSON.state.FSM.state;
    console.log(`[WorkflowAPIClient] ========================================`);
    console.log(`[WorkflowAPIClient] CALLING GENERATING API`);
    console.log(`[WorkflowAPIClient] ========================================`);
    console.log(`[WorkflowAPIClient] FSM State: ${fsmState}`);

    const payload = JSON.stringify(stateJSON, null, 2);
    console.log(`[WorkflowAPIClient] ========== REQUEST PAYLOAD ==========`);
    console.log(`[WorkflowAPIClient] Payload size: ${payload.length} characters`);
    console.log(`[WorkflowAPIClient] Current Location:`, {
      stage_id: stateJSON.observation?.location?.current?.stage_id,
      step_id: stateJSON.observation?.location?.current?.step_id,
      behavior_id: stateJSON.observation?.location?.current?.behavior_id,
    });
    const nb = (stateJSON as any).state?.notebook;
    console.log(`[WorkflowAPIClient] Notebook summary:`, {
      notebook_id: nb?.notebook_id ?? null,
      cell_count: nb?.cell_count ?? 0,
      cells_len: Array.isArray(nb?.cells) ? nb.cells.length : 0,
      last_cell_type: nb?.last_cell_type ?? null,
    });
    console.log(`[WorkflowAPIClient] FULL PAYLOAD:`);
    console.log(payload);

    try {
      const response = await fetch(`${this.baseURL}/generating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(this.timeout),
      });

      console.log(`[WorkflowAPIClient] ========== GENERATING API RESPONSE ==========`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[WorkflowAPIClient] ERROR RESPONSE:`, errorText);
        throw new Error(`Generating API failed: ${response.status} - ${errorText}`);
      }

      console.log(`[WorkflowAPIClient] ========== GENERATING API STREAMING RESPONSE ==========`);

      // Response is SSE (Server-Sent Events) stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[WorkflowAPIClient] Generating API stream completed');
            console.log(`[WorkflowAPIClient] ========================================`);
            break;
          }

          // Decode chunk
          const chunk = decoder.decode(value, { stream: true });
          console.log(`[WorkflowAPIClient] RAW STREAM CHUNK (${chunk.length} bytes):`, chunk);
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) {
              // Skip empty lines and comments
              continue;
            }

            // Try to parse as JSON directly first (backend may send raw JSON without "data:" prefix)
            let jsonStr = trimmed;

            // If it's SSE format "data: {...json...}", extract the JSON part
            if (trimmed.startsWith('data:')) {
              jsonStr = trimmed.substring(5).trim();
            }

            // Try to parse JSON
            try {
              const actionData = JSON.parse(jsonStr);
              console.log(
                `[WorkflowAPIClient] PARSED ACTION:`,
                JSON.stringify(actionData, null, 2)
              );
              yield actionData;
            } catch (parseError) {
              console.error('[WorkflowAPIClient] Failed to parse action JSON:', jsonStr);
              console.error('[WorkflowAPIClient] Parse error:', parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('[WorkflowAPIClient] Generating API error:', error);
      throw error;
    }
  }

  /**
   * Call Reflecting API (Streaming)
   *
   * Sends complete StateJSON to /reflecting endpoint.
   * Returns async generator yielding action objects (same as generating API).
   *
   * @param stateJSON - Complete state JSON
   * @returns Async generator of action objects
   */
  async *callReflectingAPI(stateJSON: StateJSON): AsyncGenerator<any> {
    const fsmState = stateJSON.state.FSM.state;
    console.log(`[WorkflowAPIClient] ========================================`);
    console.log(`[WorkflowAPIClient] CALLING REFLECTING API`);
    console.log(`[WorkflowAPIClient] ========================================`);
    console.log(`[WorkflowAPIClient] FSM State: ${fsmState}`);

    // Log the COMPLETE payload for debugging
    const payload = JSON.stringify(stateJSON, null, 2);
    console.log(`[WorkflowAPIClient] ========== REQUEST PAYLOAD ==========`);
    console.log(`[WorkflowAPIClient] Payload size: ${payload.length} characters`);
    console.log(`[WorkflowAPIClient] Current Location:`, {
      stage_id: stateJSON.observation?.location?.current?.stage_id,
      step_id: stateJSON.observation?.location?.current?.step_id,
      behavior_id: stateJSON.observation?.location?.current?.behavior_id,
    });
    const nb = (stateJSON as any).state?.notebook;
    console.log(`[WorkflowAPIClient] Notebook summary:`, {
      notebook_id: nb?.notebook_id ?? null,
      cell_count: nb?.cell_count ?? 0,
      cells_len: Array.isArray(nb?.cells) ? nb.cells.length : 0,
      last_cell_type: nb?.last_cell_type ?? null,
    });
    console.log(`[WorkflowAPIClient] Variables:`, stateJSON.state?.variables);
    console.log(`[WorkflowAPIClient] FULL PAYLOAD:`);
    console.log(payload);

    try {
      console.log(`[WorkflowAPIClient] Sending request to: ${this.baseURL}/reflecting`);

      const response = await fetch(`${this.baseURL}/reflecting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(this.timeout),
      });

      console.log(`[WorkflowAPIClient] ========== RESPONSE RECEIVED ==========`);
      console.log(`[WorkflowAPIClient] Response status: ${response.status} ${response.statusText}`);
      console.log(
        `[WorkflowAPIClient] Response headers:`,
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[WorkflowAPIClient] ERROR RESPONSE:`, errorText);
        throw new Error(`Reflecting API failed: ${response.status} - ${errorText}`);
      }

      console.log(`[WorkflowAPIClient] ========== REFLECTING API STREAMING RESPONSE ==========`);

      // Response is SSE (Server-Sent Events) stream, same format as generating API
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[WorkflowAPIClient] Reflecting API stream completed');
            console.log(`[WorkflowAPIClient] ========================================`);
            break;
          }

          // Decode chunk
          const chunk = decoder.decode(value, { stream: true });
          console.log(`[WorkflowAPIClient] RAW STREAM CHUNK (${chunk.length} bytes):`, chunk);
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) {
              // Skip empty lines and comments
              continue;
            }

            // Try to parse as JSON directly first (backend may send raw JSON without "data:" prefix)
            let jsonStr = trimmed;

            // If it's SSE format "data: {...json...}", extract the JSON part
            if (trimmed.startsWith('data:')) {
              jsonStr = trimmed.substring(5).trim();
            }

            // Try to parse JSON
            try {
              const actionData = JSON.parse(jsonStr);
              console.log(
                `[WorkflowAPIClient] PARSED ACTION:`,
                JSON.stringify(actionData, null, 2)
              );
              yield actionData;
            } catch (parseError) {
              console.error('[WorkflowAPIClient] Failed to parse reflection action JSON:', jsonStr);
              console.error('[WorkflowAPIClient] Parse error:', parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('[WorkflowAPIClient] Reflecting API error:', error);
      throw error;
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
