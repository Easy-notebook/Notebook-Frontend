import { v4 as uuidv4 } from 'uuid';
import type { UploadFile } from './types';

/** Allocate a complete preview batch, rolling back if browser allocation fails. */
export function createAttachmentFiles(files: readonly File[]): UploadFile[] {
  const attachments: UploadFile[] = [];
  try {
    for (const file of files) {
      attachments.push({
        id: `file-${uuidv4()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
        file,
      });
    }
    return attachments;
  } catch (error) {
    attachments.forEach(({ url }) => URL.revokeObjectURL(url));
    throw error;
  }
}
