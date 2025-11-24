// services/notebookApi.ts
import { Backend_BASE_URL } from '@Config/base_url';
import { apiLog } from '@Utils/logger';
import axios from 'axios';
const API_BASE_URL = Backend_BASE_URL;

// Type definitions for API responses and data structures
export interface ApiResponse<T = any> {
  status: 'ok' | 'error';
  message?: string;
  data?: T;
}

export interface NotebookInitResponse extends ApiResponse {
  notebook_id?: string;
}

export interface ExecutionOutput {
  type: 'text' | 'image' | 'html' | 'error' | 'stream';
  content: string;
  key?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionResult extends ApiResponse {
  outputs?: ExecutionOutput[];
  error?: string;
  elapsed_time?: number;
}

export interface ExecutionStatus extends ApiResponse {
  is_running?: boolean;
  current_task?: string;
  progress?: number;
}

export interface UploadConfig {
  mode: string;
  allowedTypes?: string[];
  maxFiles?: number;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  path?: string;
}

export interface FileListResponse extends ApiResponse {
  files?: FileInfo[];
}

export interface FileContentResponse extends ApiResponse {
  content?: string;
  encoding?: string;
  type?: string;
}

export interface FileInfoResponse extends ApiResponse {
  info?: FileInfo;
}

export interface KernelStatus {
  kernel_id?: string;
  status?: 'starting' | 'idle' | 'busy' | 'dead';
  execution_count?: number;
}

export interface Cell {
  id: string;
  type: 'code' | 'markdown';
  content: string;
  outputs?: ExecutionOutput[];
  isExecuting?: boolean;
  error?: string;
  elapsed_time?: number;
}

export interface Operation {
  type: string;
  payload: Record<string, any>;
}

export interface CellExecutionResult {
  success: boolean;
  outputs: ExecutionOutput[];
  error?: string;
  elapsed_time?: number;
}

export interface CancellationResult {
  success: boolean;
  message?: string;
}

// API response handling for non-stream responses
const handleResponse = async <T = any>(response: Response): Promise<T> => {
  try {
    // First check if the response is ok
    if (!response.ok) {
      // Try to get error details, but handle cases where response body is not JSON
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = (errorData as any).message || errorMessage;
        apiLog.error('API error', { errorData });
      } catch (jsonError) {
        apiLog.error('Failed to parse error response as JSON', { jsonError });
        // Use the response text as fallback
        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        } catch (textError) {
          apiLog.error('Failed to get response text', { textError });
        }
      }
      throw new Error(errorMessage);
    }

    // Try to parse successful response
    const data: T = await response.json();
    return data;
  } catch (error) {
    // If this was already an Error we threw above, re-throw it
    if (error instanceof Error && error.message.includes('HTTP error!')) {
      throw error;
    }

    apiLog.error('Failed to parse API response', { error });

    // Provide more specific error messages for common cases
    if (error instanceof TypeError && error.message.includes('Load failed')) {
      throw new Error(
        `Network error: Unable to connect to server at ${API_BASE_URL}. Please check if the backend server is running.`
      );
    }

    throw new Error(`Invalid response from server: ${error.message || 'Unknown error'}`);
  }
};

// Notebook API Service
export class NotebookApiService {
  // Initialize notebook
  static async initializeNotebook(): Promise<NotebookInitResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await handleResponse<NotebookInitResponse>(response);
    } catch (error) {
      apiLog.error('Failed to initialize notebook', { error });

      // Provide more user-friendly error messages
      if (error instanceof TypeError && error.message.includes('Load failed')) {
        throw new Error(
          `Cannot connect to the notebook server at ${API_BASE_URL}. Please ensure the backend server is running and accessible.`
        );
      }

      throw error;
    }
  }

  static async restartNotebook(notebookId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/restart_kernel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
        }),
      });
      return await handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to restart notebook', { error });
      throw error;
    }
  }

  // Execute code
  static async executeCode(code: string, notebookId: string): Promise<ExecutionResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          notebook_id: notebookId,
        }),
      });
      return await handleResponse<ExecutionResult>(response);
    } catch (error) {
      apiLog.error('Failed to execute code', { error });

      // Provide more user-friendly error messages
      if (error instanceof TypeError && error.message.includes('Load failed')) {
        throw new Error(
          `Cannot connect to the notebook server at ${API_BASE_URL}. Please ensure the backend server is running and accessible.`
        );
      }

      throw error;
    }
  }

  // Cancel execution
  static async cancelExecution(notebookId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/cancel_execution/${notebookId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to cancel execution', { error });
      throw error;
    }
  }

  // Get execution status
  static async getExecutionStatus(notebookId: string): Promise<ExecutionStatus> {
    try {
      const response = await fetch(`${API_BASE_URL}/execution_status/${notebookId}`, {
        method: 'GET',
      });
      return await handleResponse<ExecutionStatus>(response);
    } catch (error) {
      apiLog.error('Failed to get execution status', { error });
      throw error;
    }
  }

  // Upload file
  static async uploadFile(
    notebookId: string,
    files: File[],
    uploadConfig: UploadConfig & { targetDir?: string },
    onProgress?: (e: any) => void,
    signal?: AbortSignal
  ): Promise<ApiResponse> {
    try {
      apiLog.debug('NotebookApiService.uploadFile called');
      apiLog.debug('API_BASE_URL', { url: API_BASE_URL });
      apiLog.debug('Upload target', { notebookId });
      apiLog.debug('Files to upload', {
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      });
      apiLog.debug('Upload config', { uploadConfig });

      const formData = new FormData();
      formData.append('notebook_id', notebookId);
      formData.append('mode', uploadConfig.mode);
      formData.append('allowed_types', JSON.stringify(uploadConfig.allowedTypes || []));
      formData.append('max_files', (uploadConfig.maxFiles || 10).toString());
      if (uploadConfig.targetDir) {
        formData.append('target_dir', uploadConfig.targetDir);
      }

      files.forEach((file) => {
        apiLog.debug('Appending file to FormData', { fileName: file.name });
        formData.append('files', file);
      });

      // Log FormData contents
      apiLog.debug('FormData contents');
      for (let [key, value] of formData.entries()) {
        if (value instanceof File) {
          apiLog.debug('FormData entry', { key, fileName: value.name, size: value.size });
        } else {
          apiLog.debug('FormData entry', { key, value });
        }
      }

      const url = `${API_BASE_URL}/upload_file`;
      apiLog.debug('Making request', { url });

      // Use axios to support upload progress and abort
      const axiosResp = await axios.post<ApiResponse>(url, formData, {
        signal,
        onUploadProgress: (evt) => {
          try {
            if (onProgress) onProgress(evt as any);
          } catch (cbErr) {
            apiLog.warn('onUploadProgress callback error', { error: cbErr });
          }
        },
        headers: {
          // Let axios set proper multipart boundary automatically
          Accept: 'application/json',
        },
      });

      apiLog.debug('Upload completed', { status: axiosResp.status });
      return axiosResp.data;
    } catch (error) {
      apiLog.error('Failed to upload files', { error });
      apiLog.error('Error details', { name: error.name });
      apiLog.error('Error message', { message: error.message });
      apiLog.error('Error stack', { stack: error.stack });
      throw error;
    }
  }

  // List files
  static async listFiles(notebookId: string): Promise<FileListResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/list_files/${notebookId}`, {
        method: 'GET',
      });
      return await handleResponse<FileListResponse>(response);
    } catch (error) {
      apiLog.error('Failed to list files', { error });
      throw error;
    }
  }

  // Download file
  static async downloadFile(notebookId: string, filename: string): Promise<Blob> {
    try {
      const response = await fetch(`${API_BASE_URL}/download_file/${notebookId}/${filename}`, {
        method: 'GET',
      });
      if (!response.ok) {
        const data = await response.json();
        apiLog.error('API error', { data });
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }
      return response.blob();
    } catch (error) {
      apiLog.error('Failed to download file', { error });
      throw error;
    }
  }

  // Create file
  static async createFile(
    notebookId: string,
    filename: string,
    content: string,
    options?: { overwrite?: boolean; make_dirs?: boolean }
  ): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/create_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename,
          content,
          overwrite: options?.overwrite ?? true,
          make_dirs: options?.make_dirs ?? true,
        }),
      });
      return await handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to create file', { error });
      throw error;
    }
  }

  // Shutdown notebook
  static async shutdownNotebook(notebookId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/shutdown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
        }),
      });
      return await handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to shutdown notebook', { error });
      throw error;
    }
  }

  // Check kernel status
  static async checkKernelStatus(): Promise<KernelStatus> {
    try {
      const response = await fetch(`${API_BASE_URL}/status`, {
        method: 'GET',
      });
      return await handleResponse<KernelStatus>(response);
    } catch (error) {
      apiLog.error('Failed to check kernel status', { error });
      throw error;
    }
  }

  // ADDED: Send operation to backend (Unified Interface)
  static async sendOperation(
    notebookId: string,
    operation: Operation
  ): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/send_operation`, {
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
          `Cannot connect to the notebook server at ${API_BASE_URL}. Please ensure the backend server is running and accessible.`
        );
      }

      throw error;
    }
  }

  // get file
  static async getFile(notebookId: string, filename: string): Promise<FileContentResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/get_file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename: filename,
        }),
      });
      return await handleResponse<FileContentResponse>(response);
    } catch (error) {
      apiLog.error('Failed to get file', { error });
      throw error;
    }
  }

  // get file info
  static async getFileInfo(notebookId: string, filename: string): Promise<FileInfoResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/get_file_info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename: filename,
        }),
      });
      return await handleResponse<FileInfoResponse>(response);
    } catch (error) {
      apiLog.error('Failed to get file info', { error });
      throw error;
    }
  }

  // delete file
  static async deleteFile(notebookId: string, filename: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/delete_file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename,
        }),
      });
      return await handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to delete file', { error });
      throw error;
    }
  }
}

// Notebook Store Integration
export const notebookApiIntegration = {
  // Initialize notebook
  initializeNotebook: async (): Promise<string> => {
    try {
      const result = await NotebookApiService.initializeNotebook();
      if (result.status === 'ok' && result.notebook_id) {
        apiLog.info('Notebook initialized', { notebookId: result.notebook_id });
        return result.notebook_id;
      }
      throw new Error(result.message || 'Failed to initialize notebook');
    } catch (error) {
      apiLog.error('Notebook initialization error', { error });
      throw error;
    }
  },

  // Execute code
  executeCode: async (code: string, notebookId: string): Promise<CellExecutionResult> => {
    try {
      const result = await NotebookApiService.executeCode(code, notebookId);
      return {
        success: result.status === 'ok',
        outputs: result.outputs || [],
        error: result.error,
        elapsed_time: result.elapsed_time,
      };
    } catch (error) {
      apiLog.error('Code execution error', { error });
      throw error;
    }
  },

  // Cancel execution
  cancelExecution: async (notebookId: string): Promise<CancellationResult> => {
    try {
      const result = await NotebookApiService.cancelExecution(notebookId);
      return {
        success: result.status === 'ok',
        message: result.message,
      };
    } catch (error) {
      apiLog.error('Execution cancellation error', { error });
      throw error;
    }
  },

  // Get execution status
  getExecutionStatus: async (notebookId: string): Promise<ExecutionStatus> => {
    try {
      return await NotebookApiService.getExecutionStatus(notebookId);
    } catch (error) {
      apiLog.error('Get execution status error', { error });
      throw error;
    }
  },

  // Run all cells
  runAllCells: async (
    cells: Cell[],
    notebookId: string,
    updateCell: (cellId: string, updates: Partial<Cell>) => void
  ): Promise<void> => {
    for (const cell of cells) {
      if (cell.type === 'code' && cell.content.trim()) {
        try {
          updateCell(cell.id, { isExecuting: true, outputs: [] });
          const result = await NotebookApiService.executeCode(cell.content, notebookId);

          updateCell(cell.id, {
            isExecuting: false,
            outputs: result.outputs || [],
            error: result.error,
            elapsed_time: result.elapsed_time,
          });

          if (result.status === 'error') {
            break; // Stop execution on error
          }
        } catch (error) {
          updateCell(cell.id, {
            isExecuting: false,
            outputs: [
              {
                type: 'error',
                content: (error as Error).message,
                key: `error-${Date.now()}`,
              },
            ],
            error: (error as Error).message,
          });
          break; // Stop execution on error
        }
      }
    }
  },

  // Upload files
  uploadFiles: async (
    notebookId: string,
    files: File[],
    config: UploadConfig & { targetDir?: string },
    onProgress?: (e: ProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<ApiResponse> => {
    try {
      return await NotebookApiService.uploadFile(notebookId, files, config, onProgress, signal);
    } catch (error) {
      apiLog.error('File upload error', { error });
      throw error;
    }
  },

  // List files
  listFiles: async (notebookId: string): Promise<FileListResponse> => {
    try {
      return await NotebookApiService.listFiles(notebookId);
    } catch (error) {
      apiLog.error('List files error', { error });
      throw error;
    }
  },

  //getFile
  getFile: async (notebookId: string, filename: string): Promise<FileContentResponse> => {
    try {
      return await NotebookApiService.getFile(notebookId, filename);
    } catch (error) {
      apiLog.error('Get file error', { error });
      throw error;
    }
  },

  // createFile
  createFile: async (
    notebookId: string,
    filename: string,
    content: string,
    options?: { overwrite?: boolean; make_dirs?: boolean }
  ): Promise<ApiResponse> => {
    try {
      return await NotebookApiService.createFile(notebookId, filename, content, options);
    } catch (error) {
      apiLog.error('Create file error', { error });
      throw error;
    }
  },

  // getfileInfo
  getFileInfo: async (notebookId: string, filename: string): Promise<FileInfoResponse> => {
    try {
      return await NotebookApiService.getFileInfo(notebookId, filename);
    } catch (error) {
      apiLog.error('Get file info error', { error });
      throw error;
    }
  },

  // delete file
  deleteFile: async (notebookId: string, filename: string): Promise<void> => {
    try {
      const res = await NotebookApiService.deleteFile(notebookId, filename);
      if (res.status !== 'ok') {
        throw new Error(res.message || 'Failed to delete file');
      }
    } catch (error) {
      apiLog.error('Delete file error', { error });
      throw error;
    }
  },

  // Download file
  downloadFile: async (notebookId: string, filename: string): Promise<Blob> => {
    try {
      return await NotebookApiService.downloadFile(notebookId, filename);
    } catch (error) {
      apiLog.error('Download file error', { error });
      throw error;
    }
  },

  // Shutdown notebook
  shutdownNotebook: async (notebookId: string): Promise<ApiResponse> => {
    try {
      return await NotebookApiService.shutdownNotebook(notebookId);
    } catch (error) {
      apiLog.error('Notebook shutdown error', { error });
      throw error;
    }
  },

  // Check kernel status
  checkKernelStatus: async (): Promise<KernelStatus> => {
    try {
      return await NotebookApiService.checkKernelStatus();
    } catch (error) {
      apiLog.error('Kernel status check error', { error });
      throw error;
    }
  },

  // ADDED: Send operation (Unified Interface)
  sendOperation: async (
    notebookId: string,
    operation: Operation,
    handleStreamUpdate: (data: any) => void
  ): Promise<void> => {
    try {
      const stream = await NotebookApiService.sendOperation(notebookId, operation);
      if (!stream) return;

      const reader = stream.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const readStream = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          apiLog.debug('Stream closed');
          console.log('[DEBUG] notebookServices - SSE stream completed');
          // Process any planed data in buffer
          if (buffer.trim()) {
            console.log('[DEBUG] notebookServices - Processing final buffer:', buffer);
            processBuffer();
          }
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        console.log('[DEBUG] notebookServices - Received chunk:', chunk.substring(0, 100) + '...');
        console.log('[DEBUG] notebookServices - Buffer length:', buffer.length);

        processBuffer();
        readStream();
      };

      // Helper function to parse concatenated JSON objects
      const processBuffer = () => {
        // Use JSON object-based parsing to handle newlines in content
        // This prevents markdown content with \n from breaking the parsing
        console.log('[DEBUG] notebookServices - Using JSON object-based parsing');
        let depth = 0;
        let start = 0;
        let inString = false;
        let escape = false;

        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === '\\') {
            escape = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              // Found a complete JSON object
              const jsonStr = buffer.substring(start, i + 1);
              try {
                const data = JSON.parse(jsonStr);
                console.log(
                  '[DEBUG] notebookServices - Parsed concatenated JSON, type:',
                  data.type
                );
                handleStreamUpdate(data);
              } catch (e) {
                apiLog.error('Failed to parse concatenated JSON', {
                  error: e,
                  json: jsonStr.substring(0, 100),
                });
              }
              start = i + 1;
            }
          }
        }

        // Keep unparsed data in buffer
        buffer = buffer.substring(start).trim();
      };

      readStream();
    } catch (error) {
      apiLog.error('Send operation error', { error });
      throw error;
    }
  },
};
