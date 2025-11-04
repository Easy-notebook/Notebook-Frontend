// Centralized helpers for building sandbox URLs for .sandbox projects
import { Backend_BASE_URL } from '@Config/base_url';

function backendBase(): string {
  try {
    return (Backend_BASE_URL || '').replace(/\/$/, '');
  } catch {
    return '';
  }
}

/** Try to extract the 32-char notebook id from a filesystem-like path */
export function findNotebookIdFromPath(path: string): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const id = parts.find(p => p.length === 32 && /^[a-fA-F0-9]+$/.test(p));
  return id || null;
}

/** From a notebook-relative filePath (e.g., ".sandbox/portfolio/index.html"), build absolute http(s)://host:port/sandbox/{id}/{relative} */
export function deriveSandboxUrlFromFile(notebookId?: string, filePath?: string): string | null {
  if (!notebookId || !filePath) return null;
  const idx = filePath.indexOf('.sandbox/');
  if (idx === -1) return null;
  const rel = filePath.substring(idx + '.sandbox/'.length).replace(/^\/+/, '');
  if (!rel) return null;
  const base = backendBase();
  return `${base}/sandbox/${notebookId}/${rel}`;
}

/** From an absolute-like projectPath (e.g., .../notebooks/{id}/.sandbox/{projectName}[/*]) -> absolute URL */
export function deriveSandboxUrlFromProjectPath(projectPath?: string): string | null {
  if (!projectPath) return null;
  const parts = projectPath.split(/[\\/]+/).filter(Boolean);
  const sandboxIdx = parts.indexOf('.sandbox');
  if (sandboxIdx === -1 || sandboxIdx >= parts.length - 1) return null;
  const projectName = parts[sandboxIdx + 1];
  const notebookId = findNotebookIdFromPath(projectPath);
  if (!projectName || !notebookId) return null;
  const base = backendBase();
  return `${base}/sandbox/${notebookId}/${projectName}/`;
}

