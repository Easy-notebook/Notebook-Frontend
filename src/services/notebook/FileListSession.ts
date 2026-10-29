import { FileTreeIndex } from './FileTreeIndex';
import { FileService } from './FileService';
import type { FileInfo, FileListResponse } from '../types';

export type FileNodeDirectory = {
  name: string;
  type: 'directory';
  path: string;
  children: FileNode[];
  revision?: number;
  creatable?: boolean;
  removable?: boolean;
};
export type FileNodeFile = {
  primary?: boolean;
  creatable?: boolean;
  name: string;
  type: 'file';
  path: string;
  size?: number;
  revision?: number;
  removable?: boolean;
  writable?: boolean;
  lastModified?: number | string;
};
export type FileNode = FileNodeDirectory | FileNodeFile;

export type FileListState = {
  revision?: number;
  files: FileNode[];
} & ({ status: 'idle' | 'loading' | 'ready' } | { status: 'error'; error: string });

function toNode(file: FileInfo): FileNode {
  const identity = { name: file.name, path: file.path || file.name };
  return file.type === 'directory'
    ? { ...identity, type: 'directory', children: (file.children ?? []).map(toNode) }
    : {
        ...identity,
        type: 'file',
        size: file.size,
        revision: file.revision,
        removable: file.removable,
        writable: file.writable,
        lastModified: file.revision ?? file.lastModified ?? 0,
      };
}

type LoadFiles = (
  notebookId: string,
  signal: AbortSignal,
  since?: number,
  datasetToken?: string
) => Promise<FileListResponse>;
const loadFiles: LoadFiles = (id, signal, since, datasetToken) =>
  FileService.listFiles(id, signal, since, datasetToken);

/** A notebook's list snapshot, owned by the latest refresh in an attached UI session. */
export class FileListSession {
  private attached = false;
  private hasSnapshot = false;
  private revision?: number;
  private datasetToken?: string;
  private datasets: FileInfo[] = [];
  private readonly index = new FileTreeIndex();
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

  fail = (error: string): void => {
    if (this.attached) this.publish({ status: 'error', files: this.state.files, error });
  };

  refresh = async (quiet = false): Promise<void> => {
    if (!this.attached || !this.notebookId || (quiet && this.request)) return;
    const previous = this.request;
    const request = new AbortController();
    this.request = request;
    previous?.abort();
    if (!this.owns(request)) return;
    if (!this.hasSnapshot) this.publish({ status: 'loading', files: this.state.files });
    if (!this.owns(request)) return;
    try {
      const response = await this.load(
        this.notebookId,
        request.signal,
        this.revision,
        this.datasetToken
      );
      if (!this.owns(request)) return;
      if (response.status !== 'ok')
        throw new Error(response.message || 'Failed to fetch file list');
      this.revision = response.revision;
      this.datasetToken = response.datasetToken;
      if (response.datasets) {
        for (const previous of this.datasets) if (previous.path) this.index.remove(previous.path);
        this.datasets = response.datasets;
      }
      let files = this.state.files;
      if (!response.unchanged) {
        if (response.revision === undefined) files = (response.files ?? []).map(toNode);
        else {
          if (response.reset) this.index.clear();
          for (const path of response.removed ?? []) this.index.remove(path);
          for (const file of response.files ?? []) this.index.set(file);
          if (response.reset || response.datasets)
            for (const file of this.datasets) this.index.set(file);
          files = this.index.snapshot();
        }
      }
      this.request = undefined;
      this.hasSnapshot = true;
      if (
        files !== this.state.files ||
        this.state.status !== 'ready' ||
        this.state.revision !== this.revision
      )
        this.publish({
          status: 'ready',
          files,
          ...(this.revision === undefined ? {} : { revision: this.revision }),
        });
    } catch (error) {
      if (!this.owns(request)) return;
      this.request = undefined;
      this.publish({
        status: 'error',
        files: this.state.files,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
