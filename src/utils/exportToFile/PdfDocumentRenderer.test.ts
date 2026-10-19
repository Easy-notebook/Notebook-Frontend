import { EventEmitter } from 'node:events';
import { expect, it } from 'vitest';
import { renderPdfDocument } from './PdfDocumentRenderer';
it('waits for stream end before resolving a PDF blob', async () => {
  class Stream extends EventEmitter {
    end() {
      this.emit('data', new Uint8Array([37, 80, 68, 70]));
      this.emit('end');
    }
  }
  const blob = await renderPdfDocument({ getStream: () => new Stream() });
  expect(blob.type).toBe('application/pdf');
  expect(blob.size).toBe(4);
});
it('rejects synchronous layout and asynchronous stream errors', async () => {
  await expect(
    renderPdfDocument({
      getStream() {
        throw new Error('layout');
      },
    })
  ).rejects.toThrow('layout');
  class Stream extends EventEmitter {
    end() {
      this.emit('error', new Error('stream'));
      this.emit('end');
    }
  }
  await expect(renderPdfDocument({ getStream: () => new Stream() })).rejects.toThrow('stream');
});
