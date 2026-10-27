import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { FileService } from '@Services/notebook/FileService';
import { createAttachmentFiles } from './AttachmentFiles';
import type { UploadFile } from './types';

/** Owns the empty-state API's combined notebook creation and first upload. */
export class EmptyStateAttachmentUploadService {
  readonly MAX_FILE_SIZE = 10 * 1024 * 1024;
  private creation: Promise<string> | undefined;

  private assertOwner(owner: string | null): void {
    if (useStore.getState().notebookId !== owner)
      throw new Error('Notebook changed during attachment upload');
  }

  private async create(files: File[]): Promise<string> {
    const response = await FileService.createNotebookWithFiles(files, 'assets');
    this.assertOwner(null);
    const data: unknown = response.data;
    const nestedId =
      data && typeof data === 'object' && 'notebook_id' in data ? data.notebook_id : undefined;
    const notebookId = response.notebook_id || nestedId;
    if (response.status !== 'ok' || typeof notebookId !== 'string' || !notebookId)
      throw new Error(response.message || 'Notebook creation returned no notebook ID');
    await useStore.getState().setNotebookId(notebookId);
    this.assertOwner(notebookId);
    useCodeStore.getState().setKernelReady(true);
    return notebookId;
  }

  async uploadFiles(input: File[]): Promise<UploadFile[]> {
    const files = [...input];
    if (!files.length) return [];
    for (const file of files) {
      if (file.size > this.MAX_FILE_SIZE)
        throw new Error(`File ${file.name} is too large. Maximum size allowed is 10MB`);
    }
    let owner = useStore.getState().notebookId;
    if (!owner && !this.creation) {
      const creation = this.create(files);
      this.creation = creation;
      try {
        owner = await creation;
      } finally {
        if (this.creation === creation) this.creation = undefined;
      }
    } else {
      // Later batches share creation, but still upload their own files exactly once.
      if (!owner) owner = await this.creation!;
      this.assertOwner(owner);
      const response = await FileService.uploadFile(owner, files, {
        mode: 'unrestricted',
        allowedTypes: [
          '.csv',
          '.xlsx',
          '.xls',
          '.jpg',
          '.png',
          '.jpeg',
          '.gif',
          '.pdf',
          '.doc',
          '.docx',
          '.ppt',
          '.pptx',
          '.txt',
          '.md',
        ],
        targetDir: 'assets',
      });
      this.assertOwner(owner);
      if (response.status !== 'ok') throw new Error(response.message || 'Attachment upload failed');
    }
    this.assertOwner(owner);
    return createAttachmentFiles(files);
  }
}

export const emptyStateAttachmentUploadService = new EmptyStateAttachmentUploadService();
