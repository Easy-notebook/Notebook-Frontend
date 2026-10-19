import { FileService } from './FileService';

/** Browser file actions resolve only after the requested operation succeeds. */
export class FileActionClient {
  async deleteFile(notebookId: string, filename: string): Promise<void> {
    const response = await FileService.deleteFile(notebookId, filename);
    if (response.status !== 'ok') throw new Error(response.message || 'Failed to delete file');
  }

  async downloadFile(notebookId: string, filename: string): Promise<void> {
    const blob = await FileService.downloadFile(notebookId, filename);
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      try {
        anchor.href = url;
        anchor.download = filename.split('/').pop() || filename;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export const fileActionClient = new FileActionClient();
