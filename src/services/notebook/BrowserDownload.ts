/** Release browser resources after handing a verified file to the download manager. */
export function downloadBlob(blob: Blob, filename: string): void {
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
