import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
/** Bounded app-server JSON-RPC connection shared by discovery and execution. */
export class CodexConnection {
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }
  >();
  private readonly child;
  private readonly lines;
  private stderr = '';
  onMessage: (message: any) => void = () => {};
  onError: (error: Error) => void = () => {};
  constructor() {
    const cli = join(
      dirname(createRequire(import.meta.url).resolve('@openai/codex/package.json')),
      'bin/codex.js'
    );
    this.child = spawn(
      process.env.NOTEBOOK_CODEX_BIN || process.execPath,
      process.env.NOTEBOOK_CODEX_BIN ? ['app-server'] : [cli, 'app-server'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    this.child.on('error', (error) => this.fail(error));
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.stderr.on('data', (data) => {
      this.stderr = (this.stderr + String(data)).slice(-4000);
    });
    this.child.on('exit', (code) => this.fail(new Error(`Codex exited (${code}): ${this.stderr}`)));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => {
      try {
        if (line.length > 8_000_000) throw new Error('Codex response exceeds 8 MB');
        const message = JSON.parse(line);
        if (message.id !== undefined && !message.method) {
          const waiter = this.pending.get(message.id);
          if (!waiter) return;
          clearTimeout(waiter.timer);
          this.pending.delete(message.id);
          message.error
            ? waiter.reject(new Error(message.error.message))
            : waiter.resolve(message.result);
        } else this.onMessage(message);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  send(value: unknown) {
    if (!this.closed) this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  request(method: string, params: unknown): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Codex connection closed'));
    if (this.pending.size >= 32) return Promise.reject(new Error('Codex request capacity reached'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.request('initialize', {
      clientInfo: { name: 'notebook_agent_cell', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
  }
  private fail(error: Error) {
    if (this.closed) return;
    this.onError(error);
    this.close(error);
  }
  close(error = new Error('Codex connection closed')) {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
    this.lines.close();
    this.child.kill('SIGTERM');
    const kill = setTimeout(() => {
      if (this.child.exitCode === null) this.child.kill('SIGKILL');
    }, 2000);
    kill.unref();
    this.child.once('exit', () => clearTimeout(kill));
  }
}
