// src/store/models/preview.ts
import type { FileObject as StorageFileObject, FileType, ActivePreviewMode } from '@Storage/index';

export type PreviewMode = 'notebook' | 'file';

export interface FileMetadata {
  file: File;
  lastModified?: string | number;
}

export type FileObject = StorageFileObject;

export interface PreviewFile {
  id: string;
  path: string;
  name: string;
  type: FileType;
}

export interface FileApiResponse {
  content?: string;
  dataUrl?: string;
  size?: number;
  error?: string;
}

export type { FileType, ActivePreviewMode };
