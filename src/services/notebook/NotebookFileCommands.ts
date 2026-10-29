import { NativeWorkspaceFiles } from './NativeWorkspaceFiles';

/** Product paths only; atomicity, authority and conflicts remain owned by native AAL. */
export class NotebookFileCommands {
  private readonly files: NativeWorkspaceFiles;
  constructor(notebookId: string) {
    this.files = new NativeWorkspaceFiles(notebookId, 'product');
  }
  static child(parent: string, name: string): string {
    if (
      !name.trim() ||
      name !== name.trim() ||
      name === '.' ||
      name === '..' ||
      /[\\/:%\u0000-\u001f\u007f]/.test(name)
    )
      throw new Error('请输入有效名称，不包含斜线、控制字符或首尾空格');
    return `${parent === '/' ? '' : parent}/${name}`;
  }
  create(path: string, directory: boolean) {
    return this.files.execute(
      directory ? { op: 'mkdir', path } : { op: 'create', path, content: '' }
    );
  }
  move(source: string, destination: string, revision: number | undefined) {
    if (revision === undefined) throw new Error('请先刷新文件列表');
    return this.files.execute({ op: 'move', source, destination, revision });
  }
}
