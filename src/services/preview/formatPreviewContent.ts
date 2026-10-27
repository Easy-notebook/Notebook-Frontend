import { getFileType, getMimeType } from '@Storage/fileTypes';
import type { FileType } from '@Storage/fileTypes';

interface PreviewContentInput {
  notebookId: string;
  filePath: string;
  content: string;
  backendBaseUrl?: string;
}

/** Converts backend content into renderer input without I/O or state changes. */
export function formatPreviewContent({
  notebookId,
  filePath,
  content,
  backendBaseUrl = '',
}: PreviewContentInput): { type: FileType; content: string } {
  const type = getFileType(filePath);
  if (type !== 'image' && type !== 'pdf' && type !== 'docx') return { type, content };
  if (content.startsWith('data:')) return { type, content };

  if (type === 'pdf' && !content) {
    const base = backendBaseUrl.replace(/\/+$/, '');
    const name = filePath.split('/').pop() || filePath;
    return {
      type,
      content: `${base}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`,
    };
  }
  if (type === 'docx' && !content) return { type, content };

  return { type, content: `data:${getMimeType(filePath)};base64,${content}` };
}
