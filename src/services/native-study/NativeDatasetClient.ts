import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z
  .object({
    name: z.string(),
    version: digest,
    sha256: digest,
    size: z
      .number()
      .int()
      .min(0)
      .max(4 * 1024 * 1024),
  })
  .strict();
const dataset = metadata.extend({ csv: z.string() });
export type DatasetMetadata = z.infer<typeof metadata>;
export type NativeDataset = z.infer<typeof dataset>;
const encoder = new TextEncoder();
async function sha256(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function validName(name: string): boolean {
  return (
    name.length > 0 &&
    encoder.encode(name).length <= 256 &&
    /\.csv$/i.test(name) &&
    !Array.from(name).some((char) => {
      const n = char.codePointAt(0)!;
      return char === '/' || char === '\\' || n < 32 || (n >= 127 && n <= 159);
    })
  );
}

/** Immutable uploads can be safely repeated after an unknown transport outcome. */
export class NativeDatasetClient {
  private readonly transport: NativeNotebookTransport;
  constructor(
    readonly notebookId: string,
    request: typeof fetch = (...args) => fetch(...args)
  ) {
    this.transport = new NativeNotebookTransport(notebookId, request);
  }
  private async send(
    route: 'datasets' | `datasets/${string}`,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    const deadline = AbortSignal.timeout(20_000);
    const owned = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const value = await this.transport.send(route, body, owned);
    owned.throwIfAborted();
    return value;
  }
  private owner(id: string): void {
    if (id !== this.notebookId) throw new Error('Dataset notebook identity mismatch');
  }
  private async verify(value: NativeDataset): Promise<NativeDataset> {
    if (
      !validName(value.name) ||
      encoder.encode(value.csv).length !== value.size ||
      (await sha256(value.csv)) !== value.sha256 ||
      (await sha256(`${value.name}\0${value.csv}`)) !== value.version
    )
      throw new Error('Dataset content integrity check failed');
    return value;
  }
  async list(signal?: AbortSignal): Promise<DatasetMetadata[]> {
    const response = z
      .object({
        frontend_notebook_id: z.string(),
        datasets: z.array(metadata).max(128),
      })
      .strict()
      .parse(await this.send('datasets', undefined, signal));
    this.owner(response.frontend_notebook_id);
    if (
      response.datasets.some((item) => !validName(item.name)) ||
      new Set(response.datasets.map((item) => item.version)).size !== response.datasets.length
    )
      throw new Error('Invalid dataset catalog');
    return response.datasets.sort(
      (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
    );
  }
  async read(version: string, signal?: AbortSignal): Promise<NativeDataset> {
    digest.parse(version);
    const response = z
      .object({
        frontend_notebook_id: z.string(),
        dataset,
      })
      .strict()
      .parse(await this.send(`datasets/${version}`, undefined, signal));
    this.owner(response.frontend_notebook_id);
    if (response.dataset.version !== version) throw new Error('Dataset version mismatch');
    return this.verify(response.dataset);
  }
  async download(selected: DatasetMetadata, signal?: AbortSignal): Promise<Blob> {
    const expected = metadata.parse(selected);
    if (!validName(expected.name)) throw new Error('Invalid dataset filename');
    const deadline = AbortSignal.timeout(20_000);
    const owned = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const bytes = await this.transport.bytes(
      `datasets/${expected.version}/download`,
      expected.size,
      owned
    );
    // Preserve BOM and CRLF, reject lossy decoding, and reuse the same identity check.
    const csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    await this.verify({ ...expected, csv });
    owned.throwIfAborted();
    return new Blob([new Uint8Array(bytes)], { type: 'text/csv;charset=utf-8' });
  }
  async upload(name: string, csv: string, signal?: AbortSignal): Promise<NativeDataset> {
    if (!validName(name)) throw new Error('请选择文件名不超过 256 字节的 CSV 文件');
    if (encoder.encode(csv).length > 4 * 1024 * 1024) throw new Error('CSV 不能超过 4 MiB');
    if (encoder.encode(JSON.stringify({ name, csv })).length > 5 * 1024 * 1024)
      throw new Error('编码后的上传请求不能超过 5 MiB');
    const response = z
      .object({
        frontend_notebook_id: z.string(),
        dataset: metadata,
      })
      .strict()
      .parse(await this.send('datasets', { name, csv }, signal));
    this.owner(response.frontend_notebook_id);
    if (response.dataset.name !== name) throw new Error('Dataset filename mismatch');
    return this.verify({ ...response.dataset, csv });
  }
}
