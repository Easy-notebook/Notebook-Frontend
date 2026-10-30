import { cellSourceIndex } from './NotebookSourceView';
import { z } from 'zod';
import type { Cell } from '@Store/models';
import type { NotebookSnapshot } from '../autoSave/types';
import { NotebookSnapshotDocument } from '../autoSave/NotebookSnapshotDocument';
import {
  documentToolSchemas,
  type DocumentToolName,
  type NotebookEditBatch,
} from './documentProtocol';

export interface NotebookDocumentPorts {
  snapshot(): NotebookSnapshot;
  replace(cells: Cell[]): void;
  persist(snapshot: NotebookSnapshot): Promise<void>;
  artifact(
    operation: 'write' | 'list' | 'read',
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<unknown>;
}
/** Run-scoped, versioned document editing. Backup is a precondition, never an afterthought. */
export class NotebookDocumentTools {
  private fingerprint = '';
  private revision = crypto.randomUUID();
  private readonly backups = new Map<string, string>();
  constructor(
    private readonly ports: NotebookDocumentPorts,
    private readonly assertOwner: () => void,
    private readonly signal: AbortSignal
  ) {
    this.observe();
  }
  observe() {
    const snapshot = this.ports.snapshot();
    const fingerprint = JSON.stringify([
      snapshot.notebookId,
      snapshot.notebookTitle,
      snapshot.tasks.map((task) => ({
        ...task,
        phases: task.phases.map((phase) => ({
          ...phase,
          intro: phase.intro?.map((cell) => cell.id),
          steps: phase.steps.map((step) => ({
            ...step,
            content: step.content?.map((cell) => cell.id),
          })),
        })),
      })),
      snapshot.cells.map((cell) =>
        cell.type === 'agent' ? { id: cell.id, type: cell.type, enableEdit: cell.enableEdit } : cell
      ),
    ]);
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      this.revision = crypto.randomUUID();
    }
  }
  private current(version?: string) {
    this.assertOwner();
    this.observe();
    if (version && version !== this.revision)
      throw new Error('VERSION_CONFLICT: notebook changed; read_notebook again.');
    return this.ports.snapshot();
  }
  async execute(name: DocumentToolName, input: unknown): Promise<unknown> {
    const snapshot = this.current();
    if (name === 'read_notebook') {
      const { offset, limit } = documentToolSchemas.read_notebook.parse(input);
      const cells = [];
      for (const [index, cell] of snapshot.cells.slice(offset, offset + limit).entries()) {
        cells.push({
          ...cellSourceIndex(cell, offset + index),
          outputCount: cell.outputs?.length ?? 0,
          provenance: cell.metadata?.importSource
            ? {
                role: cell.metadata.transcriptRole,
                kind: cell.metadata.transcriptKind,
                sourceLine: cell.metadata.sourceLine,
                sourceEndLine: cell.metadata.sourceEndLine,
                executionPolicy: cell.metadata.executionPolicy,
              }
            : undefined,
        });
      }
      return {
        notebookId: snapshot.notebookId,
        title: snapshot.notebookTitle,
        version: this.revision,
        totalCells: snapshot.cells.length,
        cells,
        nextOffset: offset + cells.length < snapshot.cells.length ? offset + cells.length : null,
      };
    }
    if (name === 'list_notebook_files' || name === 'read_notebook_file') {
      const args =
        name === 'read_notebook_file'
          ? documentToolSchemas.read_notebook_file.parse(input)
          : documentToolSchemas.list_notebook_files.parse(input);
      const result = await this.ports.artifact(
        name === 'read_notebook_file' ? 'read' : 'list',
        { notebookId: snapshot.notebookId, ...args },
        this.signal
      );
      this.assertOwner();
      return result;
    }
    if (name === 'backup_notebook' || name === 'save_notebook_copy') {
      const args = documentToolSchemas[name].parse(input);
      const before = this.current(args.version);
      const document = new NotebookSnapshotDocument(before);
      const result = z
        .object({ fileId: z.string().uuid(), path: z.string().min(1) })
        .passthrough()
        .parse(
          await this.ports.artifact(
            'write',
            { notebookId: before.notebookId, label: args.label, content: document.content },
            this.signal
          )
        );
      this.current(args.version);
      if (name === 'backup_notebook') this.backups.set(result.fileId, args.version);
      return {
        ...result,
        ...(name === 'backup_notebook' ? { backupId: result.fileId } : {}),
        version: args.version,
        saved: true,
      };
    }
    if (name === 'flush_notebook') {
      const { version } = documentToolSchemas.flush_notebook.parse(input);
      const before = this.current(version);
      await this.ports.persist(before);
      this.current(version);
      return { saved: true, notebookId: before.notebookId, version };
    }
    const batch = documentToolSchemas.apply_notebook_edits.parse(input);
    const before = this.current(batch.version);
    if (this.backups.get(batch.backupId) !== batch.version)
      throw new Error('BACKUP_REQUIRED: back up this exact document version before editing.');
    const { cells, insertedCellIds } = this.apply(before.cells, batch);
    this.current(batch.version);
    this.ports.replace(cells);
    this.observe();
    return {
      applied: true,
      version: this.revision,
      insertedCellIds,
      backupId: batch.backupId,
      persisted: false,
      next: 'flush_notebook',
    };
  }
  private apply(original: Cell[], batch: NotebookEditBatch) {
    const cells = [...original];
    const insertedCellIds: string[] = [];
    const editable = (id: string) => {
      const cell = cells.find((cell) => cell.id === id);
      if (!cell) throw new Error(`Unknown cell: ${id}`);
      if (cell.enableEdit === false || !['markdown', 'raw', 'code', 'hybrid'].includes(cell.type))
        throw new Error(`Protected cell: ${id}`);
      return cell;
    };
    for (const operation of batch.operations) {
      if (operation.op === 'update') {
        const cell = editable(operation.cellId);
        cells[cells.indexOf(cell)] = { ...cell, content: operation.content };
      } else if (operation.op === 'remove') {
        const cell = editable(operation.cellId);
        // Historical tool calls and outputs must remain auditable during organization.
        if (
          cell.type !== 'markdown' ||
          cell.metadata?.transcriptRole === 'tool' ||
          cell.metadata?.transcriptRole === 'system' ||
          cell.outputs?.length
        )
          throw new Error('Only prose Markdown cells without outputs can be removed');
        cells.splice(cells.indexOf(cell), 1);
      } else {
        if (operation.op === 'move' && operation.cellId === operation.afterCellId)
          throw new Error('Cannot move a cell after itself');
        const cell: Cell =
          operation.op === 'move'
            ? editable(operation.cellId)
            : {
                id: crypto.randomUUID(),
                type: 'markdown',
                content: operation.content,
                outputs: [],
                enableEdit: true,
              };
        if (
          operation.afterCellId !== null &&
          !cells.some((item) => item.id === operation.afterCellId)
        )
          throw new Error('Insertion anchor no longer exists');
        if (operation.op === 'move') cells.splice(cells.indexOf(cell), 1);
        else insertedCellIds.push(cell.id);
        const index =
          operation.afterCellId === null
            ? 0
            : cells.findIndex((item) => item.id === operation.afterCellId) + 1;
        cells.splice(index, 0, cell);
      }
    }
    return { cells, insertedCellIds };
  }
}
