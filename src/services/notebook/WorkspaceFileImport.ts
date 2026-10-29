import type { FileUploadConfig } from './FileUploadClient';
import { NativeWorkspaceFiles } from './NativeWorkspaceFiles';
import { NotebookFileCommands } from './NotebookFileCommands';
/** Explorer imports are working resources, not immutable analysis dataset versions. */
export class WorkspaceFileImport {
  async uploadFiles(
    notebookId: string,
    files: File[],
    config: FileUploadConfig,
    progress: (event: ProgressEvent) => void,
    signal: AbortSignal
  ) {
    if (files.length > (config.maxFiles ?? 10)) throw new Error('Too many files');
    const parent = config.targetDir || '/';
    const prepared = await Promise.all(
      files.map(async (file) => {
        if (file.size > Math.min(config.maxFileSize, 2 * 1024 * 1024))
          throw new Error(`${file.name}: AAL 文件不能超过 2 MiB`);
        const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          await file.arrayBuffer()
        );
        if (content.includes('\0')) throw new Error(`${file.name}: 当前文件导入支持 UTF-8 文本`);
        return { path: NotebookFileCommands.child(parent, file.name), content };
      })
    );
    const workspace = new NativeWorkspaceFiles(notebookId, 'product');
    let completed = 0;
    for (const file of prepared) {
      signal.throwIfAborted();
      await workspace.execute({ op: 'create', ...file }, signal);
      progress(
        new ProgressEvent('progress', {
          loaded: ++completed,
          total: prepared.length,
          lengthComputable: true,
        })
      );
    }
    return { status: 'ok' as const };
  }
}
export const workspaceFileImport = new WorkspaceFileImport();
