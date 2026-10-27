// src/store/models/preview.ts
import type { FileObject as StorageFileObject, FileType, ActivePreviewMode } from '@Storage/index';

export type PreviewMode = 'notebook' | 'file';

/** Metadata from a file tree, link, or browser File; no blob methods are required. */
export interface PreviewFileDescriptor {
  name: string;
  path?: string;
  type?: string;
}

export interface FileMetadata {
  file?: PreviewFileDescriptor;
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
