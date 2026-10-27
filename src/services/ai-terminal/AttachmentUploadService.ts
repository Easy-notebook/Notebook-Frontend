import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';
import { FileService } from '@Services/notebook/FileService';
import { createAttachmentFiles } from './AttachmentFiles';
import type { UploadFile } from './types';

export class AttachmentUploadService {
  readonly MAX_FILE_SIZE = 10 * 1024 * 1024;
  readonly ALLOWED_EXTENSIONS = [
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
    '.txt',
    '.md',
  ];
  private initialization: Promise<string> | undefined;

  private assertOwner(notebookId: string): void {
    if (useStore.getState().notebookId !== notebookId)
      throw new Error('Notebook changed during attachment upload');
  }

  private async createNotebook(): Promise<string> {
    const response = await NotebookLifecycleService.initializeNotebook();
    if (response.status !== 'ok' || !response.notebook_id)
      throw new Error(response.message || 'Failed to initialize notebook: No notebook ID returned');
    if (useStore.getState().notebookId)
      throw new Error('Notebook changed during attachment upload');
    await useStore.getState().setNotebookId(response.notebook_id, { preserveContent: true });
    this.assertOwner(response.notebook_id);
    useCodeStore.getState().setKernelReady(true);
    return response.notebook_id;
  }

  private ensureNotebook(): Promise<string> {
    const notebookId = useStore.getState().notebookId;
    if (notebookId) return Promise.resolve(notebookId);
    if (!this.initialization) {
      this.initialization = this.createNotebook().finally(() => {
        this.initialization = undefined;
      });
    }
    return this.initialization;
  }

  async uploadFiles(input: File[]): Promise<UploadFile[]> {
    const files = [...input];
    if (!files.length) return [];
    for (const file of files) {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!this.ALLOWED_EXTENSIONS.includes(extension))
        throw new Error(`File type not allowed: ${file.name}`);
      if (file.size > this.MAX_FILE_SIZE)
        throw new Error(`File too large (max 10MB): ${file.name}`);
    }

    const notebookId = await this.ensureNotebook();
    this.assertOwner(notebookId);
    const kernelId = await useCodeStore.getState().initializeKernel();
    this.assertOwner(notebookId);
    if (kernelId !== notebookId) throw new Error('Failed to initialize notebook kernel');
    const response = await FileService.uploadFile(notebookId, files, {
      mode: 'unrestricted',
      allowedTypes: [...this.ALLOWED_EXTENSIONS],
      maxFiles: files.length,
      targetDir: 'assets',
    });
    this.assertOwner(notebookId);
    if (response.status !== 'ok') throw new Error(response.message || 'Attachment upload failed');

    return createAttachmentFiles(files);
  }
}

export const attachmentUploadService = new AttachmentUploadService();
