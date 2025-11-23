import { apiLog } from '@Utils/logger';
import { BaseService } from './BaseService';
import { Operation } from '../types';

export class OperationService extends BaseService {
  // Send operation to backend (Unified Interface)
  static async sendOperation(
    notebookId: string,
    operation: Operation
  ): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const response = await fetch(`${this.baseUrl}/send_operation`, {
        // Unified endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          operation,
        }),
      });

      // Assuming backend responds with a stream of updates
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          apiLog.error('API error', { errorData });
        } catch (jsonError) {
          apiLog.error('Failed to parse error response', { jsonError });
        }
        throw new Error(errorMessage);
      }

      // Return the response body as a stream
      return response.body;
    } catch (error) {
      apiLog.error('Failed to send operation', { error });

      // Provide more user-friendly error messages
      if (error instanceof TypeError && error.message.includes('Load failed')) {
        throw new Error(
          `Cannot connect to the notebook server at ${this.baseUrl}. Please ensure the backend server is running and accessible.`
        );
      }

      throw error;
    }
  }
}
