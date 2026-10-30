/** Incremental presentation of received Markdown; never mutates authored content. */
export class DraftPlayback {
  private target = '';
  private shown = '';
  private credit = 0;
  private waiters = new Set<() => void>();
  get text() {
    return this.shown;
  }
  get complete() {
    return this.shown === this.target;
  }
  setTarget(text: string, animate: boolean) {
    if (text === this.target) return;
    if (!text.startsWith(this.shown)) {
      const before = Array.from(this.shown),
        after = Array.from(text);
      let common = 0;
      while (common < before.length && before[common] === after[common]) common++;
      this.shown = after.slice(0, common).join('');
    }
    this.target = text;
    this.credit = 0;
    if (!animate) this.shown = text;
    this.resolve();
  }
  advance(milliseconds: number) {
    this.credit += Math.min(milliseconds, 100) * 0.06;
    const count = Math.floor(this.credit);
    this.credit -= count;
    this.shown += Array.from(this.target.slice(this.shown.length)).slice(0, count).join('');
    this.resolve();
    return this.shown;
  }
  settled() {
    return this.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => this.waiters.add(resolve));
  }
  dispose() {
    this.waiters.forEach((resolve) => resolve());
    this.waiters.clear();
  }
  private resolve() {
    if (this.complete) this.dispose();
  }
}
