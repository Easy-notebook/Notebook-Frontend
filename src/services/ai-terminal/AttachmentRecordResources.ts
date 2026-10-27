import { attachmentUrlRegistry, type AttachmentUrlRegistry } from './AttachmentUrlRegistry';

/** One record-store owner retains each referenced managed URL until its final record disappears. */
export class AttachmentRecordResources {
  private readonly leases = new Map<string, () => void>();
  constructor(private readonly registry: AttachmentUrlRegistry = attachmentUrlRegistry) {}

  update(records: readonly { attachedFiles?: readonly unknown[] }[]): void {
    const urls = new Set<string>();
    for (const record of records) {
      if (!Array.isArray(record.attachedFiles)) continue;
      for (const file of record.attachedFiles) {
        if (
          typeof file === 'object' &&
          file !== null &&
          'url' in file &&
          typeof file.url === 'string'
        )
          urls.add(file.url);
      }
    }
    for (const url of urls) {
      if (this.leases.has(url)) continue;
      const release = this.registry.retainExisting(url);
      if (release) this.leases.set(url, release);
    }
    for (const [url, release] of this.leases) {
      if (!urls.has(url)) {
        this.leases.delete(url);
        release();
      }
    }
  }
}
