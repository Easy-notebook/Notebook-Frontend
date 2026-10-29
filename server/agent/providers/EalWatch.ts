import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { z } from 'zod';

export const watchEventSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('state'),
      invocation: z.string(),
      ability: z.string(),
      state: z.string(),
    })
    .passthrough(),
  z
    .object({
      event: z.literal('terminal'),
      trace: z.string(),
      status: z.string(),
      ledger_reported_receipt_chain_verified: z.boolean(),
      cli_receipt_chain_verification: z.unknown(),
    })
    .passthrough(),
  z
    .object({
      event: z.literal('pending'),
      trace: z.string(),
      status: z.string(),
      source: z.string(),
    })
    .passthrough(),
  z.object({ event: z.literal('liveness'), status: z.string(), source: z.string() }).passthrough(),
]);
export type EalWatchEvent = z.infer<typeof watchEventSchema>;

/** Observes the daemon ledger. Closing the observer never cancels execution. */
export async function* watchEal(
  trace: string,
  signal: AbortSignal,
  executable = process.env.EASYNET_CLI || 'easynet'
): AsyncGenerator<EalWatchEvent> {
  if (!trace || trace.length > 2048 || /[\x00-\x20]/.test(trace) || trace.startsWith('-'))
    throw new Error('Invalid trace anchor');
  signal.throwIfAborted();
  const child = spawn(
    executable,
    [
      'invocation',
      'watch',
      '--trace',
      trace,
      '--follow',
      '--max-wait-seconds',
      '60',
      '--format',
      'json',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let errorOutput = '';
  child.stderr.on('data', (chunk: Buffer) => {
    errorOutput = (errorOutput + chunk.toString()).slice(-8192);
  });
  // Observe exit immediately so a fast failed spawn cannot escape the reader.
  const exited = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once('error', (error) => resolve({ code: null, error }));
    child.once('close', (code) => resolve({ code }));
  });
  const stop = () => {
    child.kill('SIGTERM');
  };
  signal.addEventListener('abort', stop, { once: true });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      signal.throwIfAborted();
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('EAL watch event exceeds 1 MiB');
      yield watchEventSchema.parse(JSON.parse(line));
    }
    const result = await exited;
    signal.throwIfAborted();
    if (result.error) throw result.error;
    if (result.code !== 0)
      throw new Error(errorOutput.trim() || `EAL observer exited ${result.code}`);
  } finally {
    signal.removeEventListener('abort', stop);
    lines.close();
    stop();
    const deadline = setTimeout(() => child.kill('SIGKILL'), 2000);
    deadline.unref();
    await exited;
    clearTimeout(deadline);
  }
}
