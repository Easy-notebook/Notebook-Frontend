import type { UploadFile } from './types';

type Resource = { file: UploadFile; inDraft: boolean; pins: number; committed: boolean };
export interface AttachmentDraftState {
  files: UploadFile[];
  uploading: number;
}

/** Owns unsubmitted URLs; submissions pin snapshots until record ownership is known. */
export class AttachmentDraft {
  private active = true;
  private epoch = 0;
  private state: AttachmentDraftState = { files: [], uploading: 0 };
  private readonly resources = new Map<string, Resource>();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)) {}
  getSnapshot = (): AttachmentDraftState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(state: AttachmentDraftState): void {
    this.state = state;
    this.listeners.forEach((notify) => notify());
  }
  private collect(resource: Resource): void {
    if (resource.inDraft || resource.pins) return;
    this.resources.delete(resource.file.id);
    if (!resource.committed) this.revoke(resource.file.url);
  }
  attach(): void {
    this.active = true;
  }
  detach(): void {
    this.active = false;
    this.reset();
  }
  reset(): void {
    this.epoch++;
    for (const resource of this.resources.values()) {
      resource.inDraft = false;
      this.collect(resource);
    }
    this.publish({ files: [], uploading: 0 });
  }
  remove = (id: string): void => {
    const resource = this.resources.get(id);
    if (!resource) return;
    resource.inDraft = false;
    this.collect(resource);
    this.publish({ ...this.state, files: this.state.files.filter((file) => file.id !== id) });
  };
  async upload(
    files: File[],
    load: (files: File[]) => Promise<UploadFile[]>,
    onError: (error: unknown) => void
  ): Promise<void> {
    if (!this.active || !files.length) return;
    const epoch = this.epoch;
    const current = () => this.active && this.epoch === epoch;
    this.publish({ ...this.state, uploading: this.state.uploading + 1 });
    try {
      if (!current()) return;
      const result = await load([...files]);
      if (!current()) {
        result.forEach((file) => this.revoke(file.url));
        return;
      }
      result.forEach((file) =>
        this.resources.set(file.id, { file, inDraft: true, pins: 0, committed: false })
      );
      this.publish({ ...this.state, files: [...this.state.files, ...result] });
    } catch (error) {
      if (current()) onError(error);
    } finally {
      if (current()) this.publish({ ...this.state, uploading: this.state.uploading - 1 });
    }
  }
  beginSubmission() {
    const epoch = this.epoch;
    const files = [...this.state.files];
    const resources = files.map((file) => this.resources.get(file.id)!);
    resources.forEach((resource) => resource.pins++);
    let settled = false;
    return {
      files,
      transfer: () => {
        if (settled) return;
        resources.forEach((resource) => {
          resource.committed = true;
        });
      },
      finish: (accepted: boolean) => {
        if (settled) return;
        settled = true;
        resources.forEach((resource) => {
          if (accepted) resource.inDraft = false;
          resource.pins--;
          this.collect(resource);
        });
        if (accepted && this.active && epoch === this.epoch) {
          const ids = new Set(files.map((file) => file.id));
          this.publish({
            ...this.state,
            files: this.state.files.filter((file) => !ids.has(file.id)),
          });
        }
      },
    };
  }
}
