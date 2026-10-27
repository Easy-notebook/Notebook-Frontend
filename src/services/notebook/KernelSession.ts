import type { KernelInitResult } from '@Store/models';

interface KernelPorts {
  notebookId(): string | null;
  ready(): boolean;
  watch(listener: (previous: string | null, next: string | null) => void): () => void;
  create(): Promise<KernelInitResult>;
  restart(id: string): Promise<KernelInitResult>;
  adopt(id: string): Promise<void>;
  publish(ready: boolean, error: string | null): void;
}
interface Attempt {
  kind: 'initialize' | 'restart';
  phase: 'creating' | 'adopting' | 'restarting';
  owner: string | null;
  promise: Promise<string | false>;
  settle(value: string | false): void;
  unsubscribe(): void;
}

/** Owns kernel readiness publication and first-notebook adoption across async boundaries. */
export class KernelSession {
  private current: Attempt | undefined;
  constructor(private readonly ports: KernelPorts) {}

  invalidate(): void {
    const attempt = this.current;
    if (!attempt) return;
    this.current = undefined;
    attempt.unsubscribe();
    attempt.settle(false);
  }
  initialize(): Promise<string | false> {
    if (this.current) return this.current.promise;
    const owner = this.ports.notebookId();
    // Preserve the existing contract: an already-selected notebook is usable without recreation.
    if (owner) {
      if (!this.ports.ready()) this.ports.publish(true, null);
      return Promise.resolve(owner);
    }
    return this.start('initialize', null);
  }
  async restart(): Promise<boolean> {
    if (this.current)
      return this.current.kind === 'restart' ? Boolean(await this.current.promise) : false;
    const owner = this.ports.notebookId();
    if (!owner) {
      this.ports.publish(false, '没有可重启的笔记本');
      return false;
    }
    return Boolean(await this.start('restart', owner));
  }
  private start(kind: Attempt['kind'], owner: string | null): Promise<string | false> {
    let settle!: (value: string | false) => void;
    const promise = new Promise<string | false>((resolve) => {
      settle = resolve;
    });
    const attempt: Attempt = {
      kind,
      phase: kind === 'initialize' ? 'creating' : 'restarting',
      owner,
      promise,
      settle,
      unsubscribe: () => {},
    };
    this.current = attempt;
    // Subscribe only when invoked, avoiding Store module initialization cycles.
    attempt.unsubscribe = this.ports.watch((previous, next) => {
      if (previous === next || this.current !== attempt) return;
      if (attempt.phase === 'adopting' && previous === null && next === attempt.owner) return;
      this.invalidate();
      this.ports.publish(false, null);
    });
    void this.run(attempt).then(settle);
    return promise;
  }
  private async run(attempt: Attempt): Promise<string | false> {
    try {
      this.ports.publish(false, null);
      if (this.current !== attempt) return false;
      const result =
        attempt.kind === 'initialize'
          ? await this.ports.create()
          : await this.ports.restart(attempt.owner!);
      if (this.current !== attempt) return false;
      if (result.status !== 'ok') throw new Error(result.message || '内核操作失败');
      if (attempt.kind === 'initialize') {
        if (!result.notebook_id) throw new Error('内核初始化未返回笔记本 ID');
        if (this.ports.notebookId() !== null) return false;
        attempt.owner = result.notebook_id;
        attempt.phase = 'adopting';
        await this.ports.adopt(result.notebook_id);
      }
      if (this.current !== attempt || this.ports.notebookId() !== attempt.owner) return false;
      this.finish(attempt);
      this.ports.publish(true, null);
      return attempt.owner || false;
    } catch (error) {
      if (this.current === attempt) {
        this.finish(attempt);
        this.ports.publish(false, error instanceof Error ? error.message : String(error));
      }
      return false;
    } finally {
      this.finish(attempt);
    }
  }
  private finish(attempt: Attempt): void {
    if (this.current !== attempt) return;
    this.current = undefined;
    attempt.unsubscribe();
  }
}
