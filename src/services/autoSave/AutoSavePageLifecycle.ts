import type { IAutoSaveService } from './types';

type PageSaveService = Pick<IAutoSaveService, 'getState' | 'subscribe' | 'flush'>;

/** Owns browser listeners, not storage lifetime. Hidden pages may become visible again. */
export class AutoSavePageLifecycle {
  private readonly unsubscribe: () => void;
  private guarding = false;
  private disposed = false;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly service: PageSaveService,
    private readonly page: Pick<
      Document,
      'visibilityState' | 'addEventListener' | 'removeEventListener'
    >,
    private readonly host: Pick<Window, 'addEventListener' | 'removeEventListener'>,
    private readonly onError: (error: unknown) => void
  ) {
    this.unsubscribe = service.subscribe((event) => {
      this.updateGuard();
      if (event.type === 'dirty_changed' && this.page.visibilityState === 'hidden') this.flush();
    });
    this.page.addEventListener('visibilitychange', this.visibilityChanged);
    this.host.addEventListener('pagehide', this.pageHidden);
    this.updateGuard();
    this.visibilityChanged();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.page.removeEventListener('visibilitychange', this.visibilityChanged);
    this.host.removeEventListener('pagehide', this.pageHidden);
    this.host.removeEventListener('beforeunload', this.beforeUnload);
    this.guarding = false;
  }

  private readonly visibilityChanged = (): void => {
    if (this.page.visibilityState === 'hidden') this.flush();
  };
  private readonly pageHidden = (): void => this.flush();
  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.service.getState().isDirty) return;
    event.preventDefault();
    event.returnValue = '';
    this.flush();
  };

  private updateGuard(): void {
    if (this.disposed) return;
    const dirty = this.service.getState().isDirty;
    if (dirty === this.guarding) return;
    this.guarding = dirty;
    if (dirty) this.host.addEventListener('beforeunload', this.beforeUnload);
    else this.host.removeEventListener('beforeunload', this.beforeUnload);
  }

  private flush(): void {
    const state = this.service.getState();
    if (this.disposed || this.flushing || !state.isDirty || state.lifecycle !== 'active') return;
    // Install ownership before calling the service, which may synchronously notify.
    this.flushing = Promise.resolve()
      .then(() => {
        if (!this.disposed && this.service.getState().lifecycle === 'active')
          return this.service.flush();
      })
      .catch(this.onError)
      .finally(() => {
        this.flushing = null;
      });
  }
}
