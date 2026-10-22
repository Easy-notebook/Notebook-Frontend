/** Local native HTTP boundary shared by study commands and AAL cells. */
export class NativeNotebookTransport {
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
  async send(
    route:
      | 'state'
      | 'knowledge'
      | 'command'
      | 'execute'
      | 'executions/lookup'
      | 'datasets'
      | `datasets/${string}`
      | `operations/${string}`,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    const response = await this.request(`${this.path}/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
      signal,
      cache: 'no-store',
    });
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
}
