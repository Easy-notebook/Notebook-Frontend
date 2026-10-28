/** Latest state wins; at most one layout read/write task runs in an animation frame. */
export class FrameTask {
  private frame: number | null = null;
  constructor(private readonly task: () => void) {}
  schedule = () => {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.task();
    });
  };
  cancel = () => {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  };
}
