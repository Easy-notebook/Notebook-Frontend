interface Ports {
  notebookId(): string | null;
  watch(check: () => void): () => void;
  publish(busy: boolean): void;
}

/** Aggregates independent notebook execution owners without allowing one to release another. */
export class NotebookExecutionActivity {
  private readonly owners = new Set<symbol>();
  constructor(private readonly ports: Ports) {}

  acquire(): { isCurrent(): boolean; release(): void } {
    const owner = Symbol('execution');
    const notebookId = this.ports.notebookId();
    this.owners.add(owner);
    let unsubscribe = () => {};
    const release = () => {
      if (!this.owners.delete(owner)) return;
      unsubscribe();
      this.ports.publish(this.owners.size > 0);
    };
    const isCurrent = () => this.owners.has(owner) && this.ports.notebookId() === notebookId;
    unsubscribe = this.ports.watch(() => {
      if (!isCurrent()) release();
    });
    if (!this.owners.has(owner)) unsubscribe();
    else this.ports.publish(true);
    return { isCurrent, release };
  }
}
