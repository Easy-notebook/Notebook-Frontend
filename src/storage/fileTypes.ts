// storage/fileTypes.ts
// File type definitions and utilities

/**
 * Supported file types
 */
export type FileType = 'image' | 'csv' | 'xlsx' | 'text' | 'pdf' | 'html' | 'jsx' | 'react' | 'doc' | 'docx' | 'javascript' | 'typescript' | 'css' | 'markdown' | 'json' | 'python' | 'hex';

/**
 * Preview mode mapping for different file types
 */
export type ActivePreviewMode = 'default' | 'csv' | 'jsx' | 'html' | 'image' | 'pdf' | 'text' | 'doc' | 'docx' | 'code' | 'markdown' | 'hex' | null;

/** Inspect the basename only; a leading dot alone denotes a hidden file, not an extension. */
const fileExtension = (filePath: string): string => {
  const basenameStart = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1;
  const dot = filePath.lastIndexOf('.');
  return dot > basenameStart ? filePath.slice(dot + 1).toLowerCase() : '';
};

/**
 * Determine file type from file extension
 */
export const getFileType = (filePath: string): FileType => {
  if (!filePath || typeof filePath !== 'string') {
    return 'text';
  }
  
  const fileExt = fileExtension(filePath);

  // Image files
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(`.${fileExt}`)) {
    return 'image';
  }

  // CSV files
  if (fileExt === 'csv') {
    return 'csv';
  }

  // Excel files
  if (fileExt === 'xlsx' || fileExt === 'xls') {
    return 'xlsx';
  }

  // PDF files
  if (fileExt === 'pdf') {
    return 'pdf';
  }

  // DOC/DOCX files
  if (fileExt === 'doc' || fileExt === 'docx') {
    return 'docx';
  }

  // HTML files
  if (fileExt === 'html' || fileExt === 'htm') {
    return 'html';
  }

  // React/JSX files
  if (fileExt === 'jsx' || fileExt === 'tsx') {
    return 'jsx';
  }

  // JavaScript files
  if (fileExt === 'ts') return 'typescript';
  if (fileExt === 'js' || fileExt === 'mjs') {
    return 'javascript';
  }

  // CSS files
  if (fileExt === 'css' || fileExt === 'scss' || fileExt === 'sass' || fileExt === 'less') {
    return 'css';
  }

  // Markdown files
  if (fileExt === 'md' || fileExt === 'markdown') {
    return 'markdown';
  }

  // JSON files
  if (fileExt === 'json') {
    return 'json';
  }

  // Python files
  if (fileExt === 'py' || fileExt === 'pyw') {
    return 'python';
  }

  // Other text files
  if (['.txt', '.log', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf'].includes(`.${fileExt}`)) {
    return 'text';
  }

  // Default - use hex for unknown binary files
  return 'hex';
};

/**
 * Get active preview mode for a file type
 */
export const getActivePreviewMode = (fileType: FileType): ActivePreviewMode => {
  switch (fileType) {
    case 'csv':
      return 'csv';
    case 'jsx':
    case 'react':
      return 'jsx';
    case 'html':
      return 'html';
    case 'image':
      return 'image';
    case 'pdf':
      return 'pdf';
    case 'docx':
    case 'doc':
      return 'docx';
    case 'javascript':
    case 'typescript':
    case 'css':
    case 'python':
    case 'json':
      return 'code';
    case 'markdown':
      return 'markdown';
    case 'text':
      return 'text';
    case 'hex':
      return 'hex';
    default:
      return 'default';
  }
};

/** Known file extensions determine rendering; extensionless/unknown names retain their declared type. */
export function getPreviewFileType<T extends string>(name: string, declaredType: T): FileType | T {
  const detected = getFileType(name);
  return detected === 'hex' ? declaredType : detected;
}

/**
 * Create MIME type from file extension
 */
export const getMimeType = (filePath: string): string => {
  if (!filePath || typeof filePath !== 'string') {
    return 'application/octet-stream';
  }
  
  const ext = fileExtension(filePath);
  
  if (ext === 'svg') return 'image/svg+xml';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  }
  if (ext === 'pdf') return 'application/pdf';
  if (['html', 'htm'].includes(ext)) return 'text/html';
  if (['txt', 'md', 'json', 'js', 'ts', 'py', 'css', 'csv', 'xml', 'yaml', 'yml'].includes(ext)) return 'text/plain';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  
  return 'application/octet-stream';
};
