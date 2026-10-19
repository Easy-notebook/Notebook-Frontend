import { attachmentUrlRegistry, type AttachmentUrlRegistry } from './AttachmentUrlRegistry';
import type { UploadFile } from './types';

type Resource = { file: UploadFile; inDraft: boolean; pins: number; release: () => void };
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
  constructor(private readonly urls: AttachmentUrlRegistry = attachmentUrlRegistry) {}
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
    if (this.resources.get(resource.file.id) === resource) this.resources.delete(resource.file.id);
    resource.release();
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
  /** Controlled inputs replace a batch; existing resource leases survive unchanged entries. */
  replaceFiles = (update: UploadFile[] | ((previous: UploadFile[]) => UploadFile[])): void => {
    const files = [...(typeof update === 'function' ? update([...this.state.files]) : update)];
    if (!this.active) {
      files.forEach((file) => this.urls.acquire(file.url)());
      return;
    }
    if (new Set(files.map((file) => file.id)).size !== files.length)
      throw new Error('Attachment IDs must be unique within a draft');
    const previous = [...this.resources.values()];
    const retained = new Set<Resource>();
    // Acquire additions before releasing removals, including different IDs sharing one URL.
    for (const file of files) {
      let resource = this.resources.get(file.id);
      if (!resource || resource.file.url !== file.url) {
        resource = { file, inDraft: true, pins: 0, release: this.urls.acquire(file.url) };
        this.resources.set(file.id, resource);
      } else {
        resource.file = file;
        resource.inDraft = true;
      }
      retained.add(resource);
    }
    for (const resource of previous) {
      if (!retained.has(resource)) {
        resource.inDraft = false;
        this.collect(resource);
      }
    }
    this.publish({ ...this.state, files });
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
        result.forEach((file) => this.urls.acquire(file.url)());
        return;
      }
      this.replaceFiles((previous) => [...previous, ...result]);
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
      finish: (accepted: boolean) => {
        if (settled) return;
        settled = true;
        resources.forEach((resource) => {
          if (accepted) resource.inDraft = false;
          resource.pins--;
          this.collect(resource);
        });
        if (accepted && this.active && epoch === this.epoch) {
          const captured = new Set(resources);
          this.publish({
            ...this.state,
            files: this.state.files.filter((file) => {
              const resource = this.resources.get(file.id);
              return resource
                ? !captured.has(resource)
                : !files.some((submitted) => submitted.id === file.id);
            }),
          });
        }
      },
    };
  }
}
