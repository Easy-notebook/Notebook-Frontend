import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import { parseStudyModel } from './studyModel';
const bytes = z
  .array(z.number().int().min(0).max(255))
  .min(48)
  .max(32 * 1024);
/** File encoding belongs to Rust; the browser only transfers bounded bytes. */
export class ModelFileClient {
  constructor(private readonly notebookId: string) {}
  async decode(data: Uint8Array, signal?: AbortSignal): Promise<string> {
    if (data.length > 32 * 1024) throw new Error('二进制模型不能超过 32 KiB。');
    const response = z
      .object({ frontend_notebook_id: z.literal(this.notebookId), model: z.unknown() })
      .strict()
      .parse(
        await new NativeNotebookTransport(this.notebookId).send(
          'model-file/decode',
          { bytes: Array.from(data) },
          signal
        )
      );
    return JSON.stringify(parseStudyModel(JSON.stringify(response.model)));
  }
  async encode(text: string, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    const response = z
      .object({ frontend_notebook_id: z.literal(this.notebookId), bytes })
      .strict()
      .parse(
        await new NativeNotebookTransport(this.notebookId).send(
          'model-file/encode',
          { model: parseStudyModel(text) },
          signal
        )
      );
    return new Uint8Array(response.bytes);
  }
}
