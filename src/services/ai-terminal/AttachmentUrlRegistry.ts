/** Leases cover only browser URLs explicitly admitted by an attachment owner. */
export class AttachmentUrlRegistry {
  private readonly references = new Map<string, number>();
  constructor(private readonly revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)) {}

  acquire(url: string): () => void {
    if (!url.startsWith('blob:')) return () => {};
    this.references.set(url, (this.references.get(url) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = this.references.get(url)! - 1;
      if (remaining) this.references.set(url, remaining);
      else {
        this.references.delete(url);
        this.revoke(url);
      }
    };
  }

  retainExisting(url: string): (() => void) | undefined {
    return this.references.has(url) ? this.acquire(url) : undefined;
  }
}

export const attachmentUrlRegistry = new AttachmentUrlRegistry();
