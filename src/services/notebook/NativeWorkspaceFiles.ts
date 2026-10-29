import { NativeDatasetClient } from '../native-study/NativeDatasetClient';
import { NativeNotebookTransport } from './NativeNotebookTransport';
import { z } from 'zod';
import { readNativeText } from './readNativeText';
import type { FileListResponse, FileContentResponse } from '../types';
const entry = z.object({
  path: z.string().startsWith('/'),
  revision: z.number().int(),
  size: z.number().int(),
  writable: z.boolean(),
  removable: z.boolean(),
  creatable: z.boolean().optional(),
  primary: z.boolean().optional(),
  type: z.enum(['file', 'directory']).optional(),
});
const catalog = z.discriminatedUnion('unchanged', [
  z.object({
    unchanged: z.literal(true),
    revision: z.number().int(),
    datasetToken: z.string().optional(),
  }),
  z.object({
    unchanged: z.literal(false),
    revision: z.number().int(),
    reset: z.boolean(),
    entries: z.array(entry).max(4096),
    removed: z.array(z.string()).max(256),
    permissions: z.unknown().optional(),
    datasetToken: z.string().optional(),
    datasets: z
      .array(z.object({ name: z.string(), version: z.string(), size: z.number() }))
      .optional(),
  }),
]);
export type FileCatalog = z.infer<typeof catalog>;
/** Native AAL owns paths, versions, partition ceilings and permission checks. */
export class NativeWorkspaceFiles {
  private readonly transport: NativeNotebookTransport;
  constructor(
    readonly notebookId: string,
    private readonly scope: 'execute' | 'product' = 'execute'
  ) {
    this.transport = new NativeNotebookTransport(notebookId);
  }
  static owns(path: string) {
    return /^\/(source|work|output|tmp|datasets)\//.test(path) || path.startsWith('datasets/');
  }
  async execute(operation: unknown, signal?: AbortSignal, datasetToken?: string): Promise<any> {
    return this.transport.send(
      'files',
      {
        action: this.scope,
        operation,
        request_id: crypto.randomUUID(),
        ...(this.scope === 'execute' ? { dataset_token: datasetToken } : {}),
      },
      signal
    );
  }
  async sync(content: string, revision: number | null, signal?: AbortSignal): Promise<FileCatalog> {
    return catalog.parse(
      await this.transport.send(
        'files',
        { action: 'sync', content, revision, request_id: crypto.randomUUID() },
        signal
      )
    );
  }
  async list(
    signal?: AbortSignal,
    since?: number,
    datasetToken?: string
  ): Promise<FileListResponse> {
    const result = catalog.parse(
      await this.execute({ op: 'catalog', since: since ?? null }, signal, datasetToken)
    );
    if (result.unchanged)
      return {
        status: 'ok',
        revision: result.revision,
        unchanged: true,
        datasetToken: result.datasetToken,
      };
    return {
      status: 'ok',
      revision: result.revision,
      reset: result.reset,
      datasetToken: result.datasetToken,
      datasets: (this.scope === 'execute' ? result.datasets : undefined)?.map((file) => ({
        name: file.name,
        path: `/datasets/${file.version}/${file.name}`,
        type: 'file',
        size: file.size,
        writable: false,
        removable: false,
      })),
      removed: result.removed,
      files: result.entries.map((file) => ({
        ...file,
        name: file.path.split('/').pop()!,
        type: file.type ?? 'file',
      })),
    };
  }
  async read(path: string): Promise<FileContentResponse> {
    if (
      this.scope === 'execute' &&
      (path.startsWith('/datasets/') || path.startsWith('datasets/'))
    ) {
      const match = /^\/?datasets\/([a-f0-9]{64})\/([^/]+)$/.exec(path);
      if (!match) throw new Error('Invalid dataset path');
      const file = await new NativeDatasetClient(this.notebookId).read(match[1]);
      if (file.name !== match[2]) throw new Error('Dataset identity mismatch');
      return { status: 'ok', content: file.csv, encoding: 'utf-8', type: 'text/csv' };
    }
    if (!(this.scope === 'product' ? path.startsWith('/') : NativeWorkspaceFiles.owns(path)))
      throw new Error('Invalid AAL file path');
    const content = await readNativeText(async (offset) => {
      const page = await this.execute({ op: 'read', path, offset, limit: 65536 });
      if (page.path !== path) throw new Error('File identity mismatch');
      return page;
    });
    return {
      status: 'ok',
      content,
      encoding: 'utf-8',
      type: path.endsWith('.csv') ? 'text/csv' : 'text/plain',
    };
  }
}
