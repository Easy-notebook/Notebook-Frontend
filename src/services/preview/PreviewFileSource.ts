import { FileService } from '@Services/notebook/FileService';
import type { FileContentResponse } from '@Services/types';

type FileReader = (notebookId: string, filePath: string) => Promise<FileContentResponse>;

/** Loads exactly one selected resource; transport failures never change its identity. */
export class PreviewFileSource {
  constructor(
    private readonly readFile: FileReader = (notebookId, filePath) =>
      FileService.getFile(notebookId, filePath)
  ) {}

  async load(notebookId: string, filePath: string): Promise<FileContentResponse> {
    const response = await this.readFile(notebookId, filePath);
    if (!response || response.status !== 'ok') {
      throw new Error(response?.message || 'Failed to fetch file for preview');
    }
    return response;
  }
}

export const previewFileSource = new PreviewFileSource();
