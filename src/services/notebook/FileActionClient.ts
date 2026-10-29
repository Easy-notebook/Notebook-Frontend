import { downloadBlob } from './BrowserDownload';
import { FileService } from './FileService';

/** Browser file actions resolve only after the requested operation succeeds. */
export class FileActionClient {
  async deleteFile(notebookId: string, filename: string, revision?: number): Promise<void> {
    const response = await FileService.deleteFile(notebookId, filename, revision);
    if (response.status !== 'ok') throw new Error(response.message || 'Failed to delete file');
  }

  async downloadFile(notebookId: string, filename: string): Promise<void> {
    const blob = await FileService.downloadFile(notebookId, filename);
    downloadBlob(blob, filename);
  }
}

export const fileActionClient = new FileActionClient();
