import type { FileInfo } from '../types';
import type { FileNode, FileNodeDirectory } from './FileListSession';
type Directory = {
  name: string;
  path: string;
  children: Map<string, Directory | FileNode>;
  snapshot?: FileNodeDirectory;
  metadata?: FileInfo;
};
function isDirectory(value: Directory | FileNode): value is Directory {
  return 'children' in value && value.children instanceof Map;
}
/** Metadata only. A delta invalidates ancestors; untouched subtrees retain object identity. */
export class FileTreeIndex {
  private root: Directory = { name: '', path: '', children: new Map() };
  private nodes?: FileNode[];
  clear() {
    this.root = { name: '', path: '', children: new Map() };
    this.nodes = undefined;
  }
  set(file: FileInfo) {
    const parts = file.path!.split('/').filter(Boolean);
    let dir = this.root;
    const ancestors = [dir];
    for (const name of parts.slice(0, -1)) {
      let child = dir.children.get(name);
      if (!child) {
        child = { name, path: dir.path + '/' + name, children: new Map() };
        dir.children.set(name, child);
      }
      if (!isDirectory(child)) throw new Error('File conflicts with directory');
      dir = child;
      ancestors.push(dir);
    }
    const name = parts[parts.length - 1];
    const previous = dir.children.get(name);
    if (file.type === 'directory') {
      if (previous && !isDirectory(previous)) throw new Error('Directory conflicts with file');
      const child: Directory = previous ?? { name, path: file.path!, children: new Map() };
      if (
        child.metadata?.revision === file.revision &&
        child.metadata?.creatable === file.creatable &&
        child.metadata?.removable === file.removable
      )
        return;
      child.metadata = file;
      child.snapshot = undefined;
      dir.children.set(name, child);
      for (const item of ancestors) item.snapshot = undefined;
      this.nodes = undefined;
      return;
    }
    if (
      previous &&
      !isDirectory(previous) &&
      previous.type === 'file' &&
      previous.revision === file.revision &&
      previous.size === file.size &&
      previous.removable === file.removable &&
      previous.writable === file.writable &&
      previous.primary === file.primary &&
      previous.creatable === file.creatable
    )
      return;
    dir.children.set(name, {
      name,
      type: 'file',
      primary: file.primary,
      creatable: file.creatable,
      path: file.path!,
      size: file.size,
      revision: file.revision,
      removable: file.removable,
      writable: file.writable,
      lastModified: file.revision ?? file.lastModified ?? 0,
    });
    for (const item of ancestors) item.snapshot = undefined;
    this.nodes = undefined;
  }
  remove(path: string) {
    const parts = path.split('/').filter(Boolean);
    let dir = this.root;
    const ancestors = [dir];
    for (const name of parts.slice(0, -1)) {
      const child = dir.children.get(name);
      if (!child || !isDirectory(child)) return;
      dir = child;
      ancestors.push(dir);
    }
    if (!dir.children.delete(parts[parts.length - 1])) return;
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const item = ancestors[i];
      item.snapshot = undefined;
      if (i && item.children.size === 0 && !item.metadata)
        ancestors[i - 1].children.delete(item.name);
    }
    this.nodes = undefined;
  }
  snapshot(): FileNode[] {
    return (this.nodes ??= this.children(this.root));
  }
  private inherited(dir: Directory, key: 'creatable' | 'removable'): boolean {
    const child = dir.children.values().next().value;
    return child
      ? isDirectory(child)
        ? (child.metadata?.[key] ?? this.inherited(child, key))
        : child[key] === true
      : false;
  }
  private children(dir: Directory): FileNode[] {
    return [...dir.children.values()]
      .sort(
        (a, b) => Number(isDirectory(b)) - Number(isDirectory(a)) || a.name.localeCompare(b.name)
      )
      .map((item) =>
        isDirectory(item)
          ? (item.snapshot ??= {
              name: item.name,
              path: item.path,
              type: 'directory',
              revision: item.metadata?.revision,
              creatable: item.metadata?.creatable ?? this.inherited(item, 'creatable'),
              removable: item.metadata?.removable ?? this.inherited(item, 'removable'),
              children: this.children(item),
            })
          : item
      );
  }
}
