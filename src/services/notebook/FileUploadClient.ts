import { FileService } from './FileService';
import type { ApiResponse } from '../types';

export interface FileUploadConfig {
  maxFileSize: number;
  mode: 'restricted' | 'open';
  allowedTypes: string[];
  maxFiles?: number;
  targetDir?: string;
}

/** Upload-only client; callers do not need unrelated preview/list/delete capabilities. */
export class FileUploadClient {
  uploadFiles(
    notebookId: string,
    files: File[],
    config: FileUploadConfig,
    onProgress: (event: ProgressEvent) => void,
    signal: AbortSignal
  ): Promise<ApiResponse> {
    return FileService.uploadFile(notebookId, files, config, onProgress, signal);
  }
}

export const fileUploadClient = new FileUploadClient();
