import { z } from 'zod';
import { NativeNotebookTransport } from './NativeNotebookTransport';
import { readNativeText } from './readNativeText';
const record = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string(),
  kind: z.enum(['original', 'backup']),
  revision: z.number().int(),
  size: z.number().int(),
});
export type NotebookVersion = z.infer<typeof record>;
/** A history identity never doubles as an Explorer path or writable file handle. */
export class NotebookVersionHistory {
  private readonly transport: NativeNotebookTransport;
  constructor(notebookId: string) {
    this.transport = new NativeNotebookTransport(notebookId);
  }
  async list(signal?: AbortSignal): Promise<NotebookVersion[]> {
    const result = z
      .object({ versions: z.array(record).max(4096) })
      .parse(await this.transport.send('files', { action: 'history', id: null }, signal));
    return result.versions.sort((a, b) => b.revision - a.revision);
  }
  read(id: string, signal?: AbortSignal) {
    return readNativeText((offset) =>
      this.transport.send('files', { action: 'history', id, offset }, signal)
    );
  }
  restore(version: NotebookVersion, destination: string) {
    return this.transport.send('files', {
      action: 'restore_version',
      id: version.id,
      destination,
      revision: version.revision,
      request_id: crypto.randomUUID(),
    });
  }
}
