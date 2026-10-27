import { apiLog } from '@Utils/logger';
import { BaseService } from './BaseService';
import { Operation } from '../types';

export class OperationService extends BaseService {
  // Send operation to backend (Unified Interface)
  static async sendOperation(
    notebookId: string,
    operation: Operation,
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const response = await fetch(`${this.baseUrl}/send_operation`, {
        // Unified endpoint
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          operation,
        }),
      });

      await this.assertSuccessfulResponse(response);

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
