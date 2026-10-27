import type { IFileRepository } from '../persistence/interfaces';
import {
  NotebookKnowledgeDocument,
  emptyKnowledge,
  statePath,
  type NotebookKnowledge,
  type ContextSource,
  type EntryKind,
  type ContextCuration,
} from './model';

/** Persisted notebook context; the JSON marker and readable projections commit together. */
export class NotebookContextService {
  private readonly snapshots = new Map<string, NotebookKnowledge>();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly files: IFileRepository) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = (notebookId: string) => this.snapshots.get(notebookId);
  private publish(value: NotebookKnowledge) {
    const previous = this.snapshots.get(value.notebookId);
    if (previous && previous.revision > value.revision) return;
    this.snapshots.set(value.notebookId, value);
    for (const listener of this.listeners) listener();
  }
  private async read(notebookId: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const file = await this.files.getFile(notebookId, statePath);
    signal?.throwIfAborted();
    if (file && file.content === undefined)
      throw new Error('上下文文件内容不可用，不能用空记录覆盖');
    const content = file?.content ?? null;
    const document = new NotebookKnowledgeDocument(
      content === null ? emptyKnowledge(notebookId) : JSON.parse(content)
    );
    if (document.value.notebookId !== notebookId)
      throw new Error('Notebook context ownership mismatch');
    return { content, document };
  }
  async load(notebookId: string, signal?: AbortSignal): Promise<NotebookKnowledge> {
    const { document } = await this.read(notebookId, signal);
    this.publish(document.value);
    return document.value;
  }
  async capture(
    source: ContextSource,
    kind: EntryKind,
    title: string,
    start: number,
    end: number,
    signal?: AbortSignal
  ) {
    const previous = await this.read(source.notebookId, signal);
    const next = previous.document.capture(source, kind, title, start, end);
    if (next !== previous.document)
      await this.commit(previous.content, previous.document, next, signal);
    else this.publish(next.value);
    return next.value;
  }
  async curate(notebookId: string, input: ContextCuration, signal?: AbortSignal) {
    const previous = await this.read(notebookId, signal);
    const next = previous.document.curate(input);
    await this.commit(previous.content, previous.document, next, signal);
    return { version: next.value.version, revision: next.value.revision, saved: true };
  }
  private async commit(
    expectedContent: string | null,
    previous: NotebookKnowledgeDocument,
    next: NotebookKnowledgeDocument,
    signal?: AbortSignal
  ) {
    const before = expectedContent === null ? new Map<string, string>() : previous.files();
    const files = [...next.files()]
      .filter(([path, content]) => before.get(path) !== content)
      .map(([filePath, content]) => ({
        notebookId: next.value.notebookId,
        filePath,
        fileName: filePath.split('/').pop()!,
        content,
        size: new TextEncoder().encode(content).length,
        lastModified: new Date().toISOString(),
      }));
    signal?.throwIfAborted();
    await this.files.saveFileSet(
      files,
      { forceLocal: true, protectNotebook: true },
      { notebookId: next.value.notebookId, filePath: statePath, expectedContent },
      signal
    );
    this.publish(next.value);
  }
  async context(notebookId: string, signal?: AbortSignal) {
    const value = await this.load(notebookId, signal);
    // Initial context is bounded; all full evidence is available via read_context(path).
    const excerpt = (kind: EntryKind) =>
      value.entries
        .filter((entry) => entry.kind === kind)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          quote: entry.quote.slice(0, 400),
          status: entry.status,
        }));
    return {
      version: value.version,
      revision: value.revision,
      startingPoints: excerpt('origin'),
      facts: excerpt('fact'),
      leads: excerpt('lead'),
      curated: value.curation,
      files: [...new NotebookKnowledgeDocument(value).files().keys()].filter((path) =>
        path.endsWith('.md')
      ),
      instruction:
        'Original evidence and starting points are durable. Read full files with read_context. Treat curator summaries as interpretations, not new evidence.',
    };
  }
  async readTool(notebookId: string, path?: string, signal?: AbortSignal, offset = 0) {
    if (!path) return this.context(notebookId, signal);
    if (!path.endsWith('.md'))
      throw new Error('Read a Markdown evidence document from the context index');
    const value = await this.load(notebookId, signal);
    const content = new NotebookKnowledgeDocument(value).files().get(path);
    if (content === undefined) throw new Error('Unknown notebook context path');
    return {
      version: value.version,
      path,
      content: content.slice(offset, offset + 64_000),
      totalLength: content.length,
      nextOffset: offset + 64_000 < content.length ? offset + 64_000 : null,
    };
  }
}
