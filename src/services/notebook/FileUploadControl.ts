/** Upload ownership attached to a UI lifetime. Detached controls reject late starts. */
export class FileUploadControl {
  private attached = true;
  private controller: AbortController | null = null;

  constructor(readonly notebookId: string | null) {
    this.attached = notebookId !== null;
  }

  get current(): AbortController | null {
    return this.controller;
  }

  set current(controller: AbortController | null) {
    if (!this.attached) {
      controller?.abort();
      return;
    }
    this.controller = controller;
  }

  attach(): void {
    this.attached = this.notebookId !== null;
  }

  detach(): void {
    this.attached = false;
    const controller = this.controller;
    this.controller = null;
    controller?.abort();
  }
}
