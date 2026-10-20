import { PreviewEngineLoadError } from './PreviewEngineLoadError';

type Renderer = typeof import('./mathRenderer');

/** One optional engine load, without retaining formula inputs or rendered outputs. */
export class MathRenderService {
  private renderer?: Promise<Renderer>;

  constructor(private readonly load: () => Promise<Renderer> = () => import('./mathRenderer')) {}

  async render(
    source: string,
    displayMode: boolean,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    if (signal?.aborted) return;
    this.renderer ??= this.load().catch((error) => {
      this.renderer = undefined;
      throw new PreviewEngineLoadError('Formula engine', error);
    });
    const renderer = await this.renderer;
    if (signal?.aborted) return;
    return renderer.renderMath(source, displayMode);
  }
}

export const mathRenderService = new MathRenderService();
