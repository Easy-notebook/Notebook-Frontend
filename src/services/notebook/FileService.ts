import axios from 'axios';
import { apiLog } from '@Utils/logger';
import { BaseService } from './BaseService';
import {
  ApiResponse,
  UploadConfig,
  FileListResponse,
  FileContentResponse,
  FileInfoResponse,
} from '../types';

export class FileService extends BaseService {
  // Upload file
  static async uploadFile(
    notebookId: string,
    files: File[],
    uploadConfig: UploadConfig & { targetDir?: string },
    onProgress?: (e: any) => void,
    signal?: AbortSignal
  ): Promise<ApiResponse> {
    try {
      apiLog.debug('FileService.uploadFile called');
      apiLog.debug('API_BASE_URL', { url: this.baseUrl });
      apiLog.debug('Upload target', { notebookId });
      apiLog.debug('Files to upload', {
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      });
      apiLog.debug('Upload config', { uploadConfig });

      const formData = new FormData();
      formData.append('notebook_id', notebookId);
      formData.append('mode', uploadConfig.mode);
      // Append allowed_types as individual fields for backend list compatibility
      if (uploadConfig.allowedTypes && uploadConfig.allowedTypes.length > 0) {
        uploadConfig.allowedTypes.forEach((type) => {
          formData.append('allowed_types', type);
        });
      } else {
        // Fallback to empty list representation if needed, or just don't send
        formData.append('allowed_types', '[]');
      }
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

      const url = `${this.baseUrl}/upload_file`;
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
    } catch (error: any) {
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
      const response = await fetch(`${this.baseUrl}/list_files/${notebookId}`, {
        method: 'GET',
      });
      return await this.handleResponse<FileListResponse>(response);
    } catch (error) {
      apiLog.error('Failed to list files', { error });
      throw error;
    }
  }

  // Download file
  static async downloadFile(notebookId: string, filename: string): Promise<Blob> {
    try {
      const response = await fetch(`${this.baseUrl}/download_file/${notebookId}/${filename}`, {
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
      const response = await fetch(`${this.baseUrl}/create_file`, {
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
      return await this.handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to create file', { error });
      throw error;
    }
  }

  // get file
  static async getFile(notebookId: string, filename: string): Promise<FileContentResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/get_file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename: filename,
        }),
      });
      return await this.handleResponse<FileContentResponse>(response);
    } catch (error) {
      apiLog.error('Failed to get file', { error });
      throw error;
    }
  }

  // get file info
  static async getFileInfo(notebookId: string, filename: string): Promise<FileInfoResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/get_file_info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename: filename,
        }),
      });
      return await this.handleResponse<FileInfoResponse>(response);
    } catch (error) {
      apiLog.error('Failed to get file info', { error });
      throw error;
    }
  }

  // delete file
  static async deleteFile(notebookId: string, filename: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/delete_file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notebook_id: notebookId,
          filename,
        }),
      });
      return await this.handleResponse<ApiResponse>(response);
    } catch (error) {
      apiLog.error('Failed to delete file', { error });
      throw error;
    }
  }
}
