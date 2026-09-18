import type { MermaidConfig } from 'mermaid';

interface Renderer {
  initialize(config: MermaidConfig): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}
interface RenderRequest {
  id: string;
  source: string;
  theme: 'light' | 'dark';
  signal: AbortSignal;
}
interface RenderJob extends RenderRequest {
  resolve: (result: { svg: string } | undefined) => void;
  reject: (reason: unknown) => void;
  cancel: () => void;
}

/** Mermaid owns global configuration: configure and render as one serialized operation.
 * Aborted waiting jobs are removed in O(1); an already-running library call cannot be interrupted.
 */
export class MermaidRenderService {
  private readonly pending = new Set<RenderJob>();
  private running = false;
  private renderer?: Promise<Renderer>;

  constructor(
    private readonly load: () => Promise<Renderer> = () =>
      import('mermaid').then((module) => module.default)
  ) {}

  render(request: RenderRequest): Promise<{ svg: string } | undefined> {
    if (request.signal.aborted) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      const job: RenderJob = {
        ...request,
        resolve,
        reject,
        cancel: () => {
          this.pending.delete(job);
          job.signal.removeEventListener('abort', job.cancel);
          resolve(undefined);
        },
      };
      this.pending.add(job);
      job.signal.addEventListener('abort', job.cancel, { once: true });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.size) {
        const job = this.pending.values().next().value!;
        this.pending.delete(job);
        try {
          this.renderer ??= this.load().catch((error) => {
            this.renderer = undefined;
            throw error;
          });
          const renderer = await this.renderer;
          if (job.signal.aborted) continue;
          renderer.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            suppressErrorRendering: true,
            theme: job.theme === 'dark' ? 'dark' : 'default',
          });
          const result = await renderer.render(job.id, job.source);
          if (!job.signal.aborted) job.resolve(result);
        } catch (error) {
          if (!job.signal.aborted) job.reject(error);
        } finally {
          job.signal.removeEventListener('abort', job.cancel);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export const mermaidRenderService = new MermaidRenderService();
