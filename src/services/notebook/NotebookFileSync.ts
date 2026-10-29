import useStore from '@Store/notebookStore';
import { NotebookSnapshotDocument } from '../autoSave/NotebookSnapshotDocument';
import { NativeWorkspaceFiles } from './NativeWorkspaceFiles';
/** A single mounted workspace owns synchronization; external revisions are never silently adopted. */
export class NotebookFileSync {
  private readonly files: NativeWorkspaceFiles;
  private revision: number | null = null;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running = false;
  private dirty = false;
  private readonly controller = new AbortController();
  constructor(
    private readonly id: string,
    private readonly changed: () => void,
    private readonly failed: (error: string) => void
  ) {
    this.files = new NativeWorkspaceFiles(id);
    const saved = sessionStorage.getItem(`aal-files-revision:${id}`);
    if (saved && Number.isSafeInteger(Number(saved))) this.revision = Number(saved);
  }
  async start() {
    this.unsubscribe = useStore.subscribe((state, previous) => {
      if (
        state.notebookId === this.id &&
        (state.cells !== previous.cells ||
          state.tasks !== previous.tasks ||
          state.notebookTitle !== previous.notebookTitle)
      ) {
        this.dirty = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), 750);
      }
    });
    await this.flush();
  }
  private async flush() {
    if (this.stopped || this.running) return;
    const state = useStore.getState();
    if (state.notebookId !== this.id) return;
    this.running = true;
    this.dirty = false;
    try {
      const content = new NotebookSnapshotDocument({
        notebookId: this.id,
        notebookTitle: state.notebookTitle,
        cells: state.cells,
        tasks: state.tasks,
        timestamp: Date.now(),
      }).content;
      const response = await this.files.sync(content, this.revision, this.controller.signal);
      if (response.unchanged) throw new Error('Missing working file metadata');
      const file = response.entries.find((file) => file.path === '/work/notebook.easynb');
      if (!file) throw new Error('Working notebook was removed');
      this.revision = file.revision;
      sessionStorage.setItem(`aal-files-revision:${this.id}`, String(file.revision));
      if (!this.stopped) this.changed();
    } catch (error) {
      if (!this.stopped)
        this.failed(`AAL 文件同步失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
      if (this.dirty && !this.stopped) this.timer = setTimeout(() => void this.flush(), 750);
    }
  }
  stop() {
    this.stopped = true;
    this.controller.abort();
    this.unsubscribe?.();
    clearTimeout(this.timer);
  }
}
