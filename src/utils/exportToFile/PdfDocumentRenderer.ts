interface PdfStream {
  on(event: 'data', listener: (chunk: Uint8Array) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  end(): void;
}
interface PdfDocument {
  getStream(): PdfStream;
}

/** Uses preloaded local fonts; observes stream failure before allowing a download. */
export function renderPdfDocument(document: PdfDocument): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    const stream = document.getStream();
    stream.on('data', (chunk) => chunks.push(new Uint8Array(chunk).buffer));
    stream.on('error', reject);
    stream.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })));
    stream.end();
  });
}
