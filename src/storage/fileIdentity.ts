const FILE_ID_SEPARATOR = '::';

/** Existing persisted identity format; paths are opaque and must not be normalized. */
export function makeFileId(notebookId: string, filePath: string): string {
  return `${notebookId}${FILE_ID_SEPARATOR}${filePath}`;
}

/** Split only the notebook delimiter, preserving all remaining path characters. */
export function parseFileId(fileId: string): { notebookId: string; filePath: string } | null {
  const separator = fileId.indexOf(FILE_ID_SEPARATOR);
  if (separator <= 0) return null;
  const filePath = fileId.slice(separator + FILE_ID_SEPARATOR.length);
  if (!filePath) return null;
  return { notebookId: fileId.slice(0, separator), filePath };
}
