import { FileService } from './FileService';
import type { FileInfo, FileListResponse } from '../types';

export type FileNodeDirectory = {
  name: string;
  type: 'directory';
  path: string;
  children: FileNode[];
};
export type FileNodeFile = {
  name: string;
  type: 'file';
  path: string;
  size?: number;
  lastModified?: number | string;
};
export type FileNode = FileNodeDirectory | FileNodeFile;

export type FileListState = {
  files: FileNode[];
} & ({ status: 'idle' | 'loading' | 'ready' } | { status: 'error'; error: string });

function toNode(file: FileInfo): FileNode {
  const identity = { name: file.name, path: file.path || file.name };
  return file.type === 'directory'
    ? { ...identity, type: 'directory', children: (file.children ?? []).map(toNode) }
    : { ...identity, type: 'file', size: file.size, lastModified: file.lastModified ?? 0 };
}

type LoadFiles = (notebookId: string, signal: AbortSignal) => Promise<FileListResponse>;
const loadFiles: LoadFiles = (id, signal) => FileService.listFiles(id, signal);

/** A notebook's list snapshot, owned by the latest refresh in an attached UI session. */
export class FileListSession {
  private attached = false;
  private request: AbortController | undefined;
  private state: FileListState = { status: 'idle', files: [] };
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly notebookId: string,
    private readonly load: LoadFiles = loadFiles
  ) {}

  getSnapshot = (): FileListState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  attach(): void {
    this.attached = true;
  }

  detach(): void {
    this.attached = false;
    const request = this.request;
    this.request = undefined;
    request?.abort();
  }

  private owns(request: AbortController): boolean {
    return this.attached && this.request === request;
  }

  private publish(state: FileListState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  refresh = async (): Promise<void> => {
    if (!this.attached || !this.notebookId) return;
    const previous = this.request;
    const request = new AbortController();
    this.request = request;
    previous?.abort();
    if (!this.owns(request)) return;
    this.publish({ status: 'loading', files: this.state.files });
    if (!this.owns(request)) return;
    try {
      const response = await this.load(this.notebookId, request.signal);
      if (!this.owns(request)) return;
      if (response.status !== 'ok')
        throw new Error(response.message || 'Failed to fetch file list');
      const files = (response.files ?? []).map(toNode);
      this.request = undefined;
      this.publish({ status: 'ready', files });
    } catch (error) {
      if (!this.owns(request)) return;
      this.request = undefined;
      this.publish({
        status: 'error',
        files: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
