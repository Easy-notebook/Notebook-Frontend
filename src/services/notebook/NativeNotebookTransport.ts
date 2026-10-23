type NativeNotebookRoute =
  | 'state'
  | 'knowledge'
  | 'knowledge-report'
  | 'knowledge-prompt'
  | 'figure'
  | 'model-file/decode'
  | 'model-file/encode'
  | 'model-file/skill-lock'
  | 'skill-archive/inspect'
  | 'skill-archive/accept'
  | 'skill-review/preview'
  | 'skill-review/request'
  | 'skill-review/decision'
  | 'skill-review/execute'
  | 'workflow/draft'
  | 'workflow/execute'
  | 'workflow/resume'
  | 'workflow/assess'
  | 'workflow/publish'
  | 'model-assignment'
  | 'model-comparison'
  | 'command'
  | 'commands/lookup'
  | 'execute'
  | 'executions/lookup'
  | 'datasets'
  | `datasets/${string}`
  | `operations/${string}`;

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
  private async response(
    route: NativeNotebookRoute,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
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
    if (!response.ok) {
      const value: unknown = await response.json();
      const error = value as { error?: { message?: unknown } };
      throw new Error(
        typeof error?.error?.message === 'string'
          ? error.error.message
          : `Native runtime HTTP ${response.status}`
      );
    }
    return response;
  }
  async send(route: NativeNotebookRoute, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    return (await this.response(route, body, signal)).json();
  }
  async bytes(
    route: `datasets/${string}/download`,
    limit: number,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const response = await this.response(route, undefined, signal);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Native download has no response body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        signal?.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > limit) throw new Error('Native download exceeds its byte limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
}
