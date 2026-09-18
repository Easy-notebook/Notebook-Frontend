import { apiLog } from '@Utils/logger';
import { BaseService } from './BaseService';
import { NotebookInitResponse, ApiResponse, KernelStatus } from '../types';

export class NotebookLifecycleService extends BaseService {
  // Initialize notebook
  static async initializeNotebook(): Promise<NotebookInitResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await this.handleResponse<NotebookInitResponse>(response);
    } catch (error) {
      apiLog.error('Failed to initialize notebook', { error });

      // Provide more user-friendly error messages
      if (error instanceof TypeError && error.message.includes('Load failed')) {
        throw new Error(
          `Cannot connect to the notebook server at ${this.baseUrl}. Please ensure the backend server is running and accessible.`
        );
      }

      throw error;
    }
  }

  static async restartNotebook(notebookId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/restart_kernel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
        }),
      });
      return await this.handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to restart notebook', { error });
      throw error;
    }
  }

  // Shutdown notebook
  static async shutdownNotebook(notebookId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/shutdown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
        }),
      });
      return await this.handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to shutdown notebook', { error });
      throw error;
    }
  }

  // Check kernel status
  static async checkKernelStatus(): Promise<KernelStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
      });
      return await this.handleResponse<KernelStatus>(response);
    } catch (error) {
      apiLog.error('Failed to check kernel status', { error });
      throw error;
    }
  }
}
