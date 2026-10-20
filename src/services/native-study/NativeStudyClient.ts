import { nativeView, type NativeView, type PendingCommand } from './contracts';

/** Same-origin transport; native notebook identity is checked independently of the URL. */
export class NativeStudyClient {
  private readonly path: string;
  constructor(
    readonly notebookId: string,
    private readonly request: typeof fetch = (...args) => fetch(...args)
  ) {
    if (
      !notebookId.trim() ||
      new TextEncoder().encode(notebookId).length > 256 ||
      Array.from(notebookId).some((c) => {
        const n = c.codePointAt(0)!;
        return n < 32 || (n >= 127 && n <= 159);
      })
    )
      throw new Error('Invalid notebook ID');
    this.path = `/aal-api/workspaces/${encodeURIComponent(notebookId)}`;
  }
  private async read(response: Response): Promise<unknown> {
    const value: unknown = await response.json();
    if (!response.ok) {
      const error = value as { error?: { message?: unknown } };
      throw new Error(
        typeof error?.error?.message === 'string'
          ? error.error.message
          : `Native runtime HTTP ${response.status}`
      );
    }
    return value;
  }
  async state(signal?: AbortSignal): Promise<NativeView> {
    const response = await this.request(`${this.path}/state`, { signal, cache: 'no-store' });
    const view = nativeView.parse(await this.read(response));
    if (view.frontend_notebook_id !== this.notebookId)
      throw new Error('Native notebook identity mismatch');
    return view;
  }
  async command(command: PendingCommand, signal?: AbortSignal): Promise<void> {
    await this.read(
      await this.request(`${this.path}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        signal,
      })
    );
  }
}
