import type { PreviewFile } from '@Store/models';
import type { FileReadRecord } from '@Services/persistence/interfaces';
import { makeFileId } from '@Storage/fileIdentity';
import { getFileType } from '@Storage/fileTypes';
import { validateFileForTab } from '@Utils/fileValidation';

/** One source's validated, notebook-scoped catalog; partial parsing never escapes. */
export class TabCatalog {
  private readonly byPath = new Map<string, PreviewFile>();

  private constructor(private readonly notebookId: string) {}

  static fromCache(notebookId: string, records: FileReadRecord[]): PreviewFile[] {
    const catalog = new TabCatalog(notebookId);
    for (const { metadata } of records) {
      if (metadata.notebookId !== notebookId) continue;
      catalog.add(metadata.filePath, metadata.fileName);
    }
    return [...catalog.byPath.values()];
  }

  static fromRemote(notebookId: string, response: unknown): PreviewFile[] {
    if (
      !response ||
      typeof response !== 'object' ||
      !('status' in response) ||
      response.status !== 'ok'
    ) {
      throw new Error('Backend file listing failed');
    }
    if (!('files' in response) || !Array.isArray(response.files)) {
      throw new Error('Backend file listing has no valid files array');
    }
    const catalog = new TabCatalog(notebookId);
    catalog.visit(response.files, '');
    return [...catalog.byPath.values()];
  }

  private visit(nodes: unknown[], parentPath: string): void {
    for (const node of nodes) {
      if (
        !node ||
        typeof node !== 'object' ||
        !('name' in node) ||
        typeof node.name !== 'string' ||
        !node.name
      ) {
        throw new Error('Invalid backend file entry');
      }
      const explicitPath = 'path' in node ? node.path : undefined;
      if (explicitPath !== undefined && typeof explicitPath !== 'string') {
        throw new Error('Invalid backend file path');
      }
      const path =
        explicitPath ||
        (parentPath
          ? `${parentPath}${parentPath.endsWith('/') ? '' : '/'}${node.name}`
          : node.name);
      if ('type' in node && node.type === 'directory') {
        const children = 'children' in node ? node.children : [];
        if (!Array.isArray(children)) throw new Error('Invalid backend directory children');
        this.visit(children, path);
      } else {
        this.add(path, node.name);
      }
    }
  }

  private add(path: string, name: string): void {
    if ((path.startsWith('notebook_') && path.endsWith('.json')) || name.endsWith('.easynb'))
      return;
    if (!validateFileForTab(path, name, '').isValid) return;
    if (!this.byPath.has(path)) {
      this.byPath.set(path, {
        id: makeFileId(this.notebookId, path),
        path,
        name,
        type: getFileType(path),
      });
    }
  }
}
