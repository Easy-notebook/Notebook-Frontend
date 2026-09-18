import { apiLog } from '@Utils/logger';
import { BaseService } from './BaseService';
import { ExecutionResult, ApiResponse, ExecutionStatus } from '../types';

export class CodeExecutionService extends BaseService {
  // Execute code
  static async executeCode(code: string, notebookId: string): Promise<ExecutionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          notebook_id: notebookId,
        }),
      });
      return await this.handleResponse<ExecutionResult>(response);
    } catch (error) {
      apiLog.error('Failed to execute code', { error });

      // Provide more user-friendly error messages
      if (error instanceof TypeError && error.message.includes('Load failed')) {
        throw new Error(
          `Cannot connect to the notebook server at ${this.baseUrl}. Please ensure the backend server is running and accessible.`
        );
      }

      throw error;
    }
  }

  // Cancel execution
  static async cancelExecution(notebookId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/cancel_execution/${notebookId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await this.handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to cancel execution', { error });
      throw error;
    }
  }

  // Get execution status
  static async getExecutionStatus(notebookId: string): Promise<ExecutionStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/execution_status/${notebookId}`, {
        method: 'GET',
      });
      return await this.handleResponse<ExecutionStatus>(response);
    } catch (error) {
      apiLog.error('Failed to get execution status', { error });
      throw error;
    }
  }
}
