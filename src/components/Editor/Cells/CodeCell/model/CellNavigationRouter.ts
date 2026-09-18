type Direction = 'up' | 'down';
type Listener = (direction: Direction) => void;

/** One browser listener; average O(1) lookup plus O(target views) dispatch. */
class CellNavigationRouter {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly handle = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || (detail.direction !== 'up' && detail.direction !== 'down')) return;
    this.listeners.get(detail.targetCellId)?.forEach((listener) => listener(detail.direction));
  };

  subscribe(cellId: string, listener: Listener): () => void {
    if (!this.listeners.size) window.addEventListener('cell-navigation', this.handle);
    const targets = this.listeners.get(cellId) ?? new Set<Listener>();
    this.listeners.set(cellId, targets);
    targets.add(listener);
    return () => {
      if (!targets.delete(listener)) return;
      if (!targets.size) this.listeners.delete(cellId);
      if (!this.listeners.size) window.removeEventListener('cell-navigation', this.handle);
    };
  }
}

export const cellNavigationRouter = new CellNavigationRouter();
