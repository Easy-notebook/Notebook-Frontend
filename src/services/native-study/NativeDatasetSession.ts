import {
  NativeDatasetClient,
  type DatasetMetadata,
  type NativeDataset,
} from './NativeDatasetClient';

export interface DatasetSnapshot {
  phase: 'idle' | 'loading' | 'uploading' | 'ready' | 'error';
  datasets: DatasetMetadata[];
  selected: DatasetMetadata | null;
  error: string | null;
}
/** One picker lifetime; replacing a request or leaving its owner suppresses late publication. */
export class NativeDatasetSession {
  private state: DatasetSnapshot = { phase: 'idle', datasets: [], selected: null, error: null };
  private attempt: AbortController | null = null;
  private disposed = false;
  constructor(
    private readonly client: Pick<NativeDatasetClient, 'list' | 'read' | 'upload'>,
    private readonly changed: (state: DatasetSnapshot) => void,
    private readonly select: (dataset: NativeDataset) => void
  ) {}
  private publish(next: Partial<DatasetSnapshot>): void {
    this.state = { ...this.state, ...next };
    this.changed(this.state);
  }
  private async run(
    phase: 'loading' | 'uploading',
    action: (signal: AbortSignal) => Promise<DatasetMetadata[] | NativeDataset>
  ): Promise<void> {
    if (this.disposed) return;
    this.attempt?.abort();
    const attempt = new AbortController();
    this.attempt = attempt;
    this.publish({ phase, error: null });
    try {
      const result = await action(attempt.signal);
      if (this.disposed || this.attempt !== attempt) return;
      if (Array.isArray(result)) this.publish({ phase: 'ready', datasets: result });
      else {
        const selected: DatasetMetadata = {
          name: result.name,
          version: result.version,
          sha256: result.sha256,
          size: result.size,
        };
        this.publish({
          phase: 'ready',
          selected,
          datasets: [
            ...this.state.datasets.filter((item) => item.version !== selected.version),
            selected,
          ],
        });
        if (!this.disposed && this.attempt === attempt) this.select(result);
      }
    } catch (error) {
      if (!this.disposed && this.attempt === attempt)
        this.publish({
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (this.attempt === attempt) this.attempt = null;
    }
  }
  refresh(): Promise<void> {
    return this.run('loading', (signal) => this.client.list(signal));
  }
  read(version: string): Promise<void> {
    return this.run('loading', (signal) => this.client.read(version, signal));
  }
  upload(file: File): Promise<void> {
    return this.run('uploading', async (signal) => {
      if (file.size > 4 * 1024 * 1024) throw new Error('CSV 不能超过 4 MiB');
      const bytes = await file.arrayBuffer();
      signal.throwIfAborted();
      // Preserve UTF-8 BOM bytes in the content identity; reject lossy decoding.
      const csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      return this.client.upload(file.name, csv, signal);
    });
  }
  dispose(): void {
    this.disposed = true;
    this.attempt?.abort();
    this.attempt = null;
  }
}
