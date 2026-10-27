type UploadPhase = 'uploading' | 'refreshing' | 'succeeded' | 'failed' | 'cancelled' | 'superseded';

interface UploadOwner {
  current: AbortController | null;
}

/** One request owns a shared upload control until replacement or settlement. */
export class FileUploadAttempt {
  private phase: UploadPhase = 'uploading';
  private readonly controller = new AbortController();

  constructor(private readonly owner: UploadOwner) {
    const previous = owner.current;
    owner.current = this.controller;
    previous?.abort();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isCurrent(): boolean {
    if (this.owner.current !== this.controller) {
      if (this.phase === 'uploading' || this.phase === 'refreshing') this.phase = 'superseded';
      return false;
    }
    return true;
  }

  /** A transport may resolve successfully even after abort; never publish that success. */
  checkCancellation(): void {
    if (this.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
  }

  publish(effect: () => void): void {
    if (this.isCurrent) effect();
  }

  progress(loaded: number, total: number, publish: (value: number) => void): void {
    if (!this.isCurrent || this.phase !== 'uploading' || this.signal.aborted) return;
    if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;
    publish(Math.max(0, Math.min(100, Math.round((loaded * 100) / total))));
  }

  beginRefresh(): boolean {
    if (!this.isCurrent || this.phase !== 'uploading') return false;
    this.checkCancellation();
    this.phase = 'refreshing';
    return true;
  }

  succeed(): boolean {
    if (!this.isCurrent || this.phase !== 'refreshing') return false;
    this.checkCancellation();
    this.phase = 'succeeded';
    return true;
  }

  fail(error: unknown): 'cancelled' | 'failed' | undefined {
    if (!this.isCurrent || (this.phase !== 'uploading' && this.phase !== 'refreshing'))
      return undefined;
    this.phase =
      this.signal.aborted || (error instanceof Error && error.name === 'AbortError')
        ? 'cancelled'
        : 'failed';
    return this.phase;
  }

  release(): void {
    if (this.isCurrent) this.owner.current = null;
  }
}
