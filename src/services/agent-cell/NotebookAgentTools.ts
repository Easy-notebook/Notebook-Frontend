import { cellSourceIndex, cellSourceDetail } from './NotebookSourceView';
import { CellContentEdit } from './CellContentEdit';
import type { CellInsertion } from './protocol';
import { agentWriting, type WritingIdentity } from '../agent-writing/AgentWriting';
import { NotebookDocumentTools, type NotebookDocumentPorts } from './NotebookDocumentTools';
import {
  documentToolSchemas,
  type DocumentToolName,
  type NotebookEditBatch,
} from './documentProtocol';
import type { ContextCuration } from '../notebook-context/model';
import { toolsForRole, type AgentRole } from './protocol';
import type { Cell } from '@Store/models';
import { toolSchemas, type ToolName, type ToolResult } from './protocol';

export interface NotebookAgentPorts {
  document?: NotebookDocumentPorts;
  notebookId(): string | null;
  cells(): readonly Cell[];
  watch(listener: () => void): () => void;
  update(id: string, content: string): void;
  run(id: string): Promise<unknown>;
  cancel(id: string): Promise<unknown>;
  busy(): boolean;
  summary(text: string, cellIds: string[]): void;
  readContext?(path: string | undefined, signal: AbortSignal, offset?: number): Promise<unknown>;
  curateContext?(input: ContextCuration, signal: AbortSignal): Promise<unknown>;
}

/** Version tokens are local to this run; any intervening edit invalidates a previously read token. */
export class NotebookAgentTools {
  private readonly detailReads = new Map<string, string>();
  private readonly revisions = new Map<string, { fingerprint: string; token: string }>();
  private readonly unsubscribe: () => void;
  private executing?: string;
  private disposed = false;
  private readonly document?: NotebookDocumentTools;
  private readonly writing: WritingIdentity;
  private readonly edits = new Map<string, string>();
  private batchCells: string[] = [];
  private outlining = false;
  constructor(
    private readonly notebookId: string,
    private readonly agentCellId: string,
    private readonly ports: NotebookAgentPorts,
    private readonly signal: AbortSignal,
    private readonly role: AgentRole = 'worker',
    identity?: Pick<WritingIdentity, 'name' | 'color'>
  ) {
    this.writing = {
      notebookId,
      ownerId: crypto.randomUUID(),
      name: identity?.name ?? 'Agent',
      color: identity?.color ?? '#d87b59',
    };
    if (ports.document)
      this.document = new NotebookDocumentTools(
        {
          ...ports.document,
          replace: (cells) => {
            const existing = new Set(ports.cells().map((cell) => cell.id));
            this.commitWriting(() => ports.document!.replace(cells), this.batchCells);
            if (this.outlining) {
              for (const cell of cells.filter((item) => !existing.has(item.id))) {
                const id = this.reserve(
                  cell.id,
                  this.read(cell.id).version,
                  '',
                  cell.content,
                  'proposed'
                );
                agentWriting.outline(id);
              }
            }
          },
        },
        () => this.assertOwner(),
        signal
      );
    this.refresh();
    this.unsubscribe = ports.watch(() => this.refresh());
    signal.addEventListener('abort', this.abort, { once: true });
  }
  private abort = () => {
    agentWriting.releaseOwner(this.writing.ownerId);
    this.edits.clear();
    if (this.executing && this.ports.notebookId() === this.notebookId)
      void this.ports.cancel(this.executing).catch(() => {});
  };
  private assertOwner() {
    this.signal.throwIfAborted();
    if (
      this.disposed ||
      this.ports.notebookId() !== this.notebookId ||
      !this.ports
        .cells()
        .some(
          (cell) =>
            cell.id === this.agentCellId && cell.type === 'agent' && cell.enableEdit !== false
        )
    )
      throw new Error('Notebook or Agent Cell context changed');
  }
  private refresh() {
    if (
      this.ports.notebookId() !== this.notebookId ||
      !this.ports.cells().some((cell) => cell.id === this.agentCellId && cell.enableEdit !== false)
    ) {
      this.abort();
      return;
    }
    this.document?.observe();
    const cells = this.ports.cells();
    const alive = new Set(cells.map((cell) => cell.id));
    for (const key of this.revisions.keys()) if (!alive.has(key)) this.revisions.delete(key);
    for (const cell of cells) {
      const fingerprint = JSON.stringify([
        cell.type,
        cell.content,
        cell.language,
        cell.enableEdit,
        cell.metadata?.editorMode,
      ]);
      if (this.revisions.get(cell.id)?.fingerprint !== fingerprint)
        this.revisions.set(cell.id, { fingerprint, token: crypto.randomUUID() });
    }
  }
  index() {
    this.assertOwner();
    this.refresh();
    return this.ports.cells().map((cell, index) => ({
      ...cellSourceIndex(cell, index),
      index,
      version: this.revisions.get(cell.id)!.token,
    }));
  }
  private read(cellId: string) {
    this.assertOwner();
    this.refresh();
    const cell = this.ports.cells().find((cell) => cell.id === cellId);
    if (!cell) throw new Error('Cell no longer exists');
    return { cell, version: this.revisions.get(cellId)!.token };
  }
  private requireDetail(cellId: string) {
    const { version } = this.read(cellId);
    if (this.detailReads.get(cellId) !== version)
      throw new Error(
        'DETAIL_READ_REQUIRED: read_cell for the current source and internal line numbers before editing this cell.'
      );
  }
  private async runCell(cellId: string): Promise<unknown> {
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.signal.reason ?? new Error('Agent run cancelled'));
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      this.signal.throwIfAborted();
      return await Promise.race([this.ports.run(cellId), cancelled]);
    } finally {
      this.signal.removeEventListener('abort', onAbort);
    }
  }
  private batchTarget(operation: NotebookEditBatch['operations'][number]) {
    return operation.op === 'insert'
      ? (operation.afterCellId ?? this.ports.cells()[0]?.id)
      : operation.cellId;
  }
  private writingTargets(name: ToolName, input: unknown): string[] {
    if (name === 'update_cell') {
      const parsed = toolSchemas.update_cell.safeParse(input);
      return parsed.success ? [parsed.data.cellId] : [];
    }
    if (name === 'apply_notebook_edits') {
      const parsed = toolSchemas.apply_notebook_edits.safeParse(input);
      if (!parsed.success) return [];
      return [
        ...new Set(
          parsed.data.operations.flatMap((operation) => {
            const id = this.batchTarget(operation);
            return id ? [id] : [];
          })
        ),
      ];
    }
    return [];
  }
  rejectWriting(name: ToolName, input: unknown) {
    this.clearWriting(this.writingTargets(name, input));
  }
  bindWritingApproval(
    name: ToolName,
    input: unknown,
    resolve: (decision: 'approve' | 'reject') => void
  ) {
    const ids = this.writingTargets(name, input).flatMap((cellId) => {
      const operation = agentWriting.forCell(this.notebookId, cellId);
      return operation?.ownerId === this.writing.ownerId ? [operation.id] : [];
    });
    return agentWriting.bindApproval(ids, { resolve });
  }
  /** Display complete mutation proposals before the existing approval wait. */
  prepareWriting(name: ToolName, input: unknown): ToolResult | undefined {
    if (name !== 'update_cell' && name !== 'apply_notebook_edits') return;
    try {
      this.assertOwner();
      if (!(name in toolsForRole(this.role)))
        throw new Error('Tool unavailable for this agent role');
      if (name === 'update_cell') {
        const args = toolSchemas.update_cell.parse(input);
        this.requireDetail(args.cellId);
        this.reserve(
          args.cellId,
          args.version,
          undefined,
          args.content,
          'proposed',
          false,
          args.insertion
        );
      } else {
        const batch = toolSchemas.apply_notebook_edits.parse(input);
        for (const operation of batch.operations) {
          if (operation.op !== 'insert') this.requireDetail(operation.cellId);
        }
        this.batchCells = this.writingTargets(name, input);
        for (const operation of batch.operations) {
          const cellId = this.batchTarget(operation);
          if (!cellId) continue;
          const { version } = this.read(cellId);
          this.reserve(
            cellId,
            version,
            operation.op === 'insert'
              ? operation.afterCellId === null
                ? 'Insert content at the start of the document'
                : 'Insert content after this cell'
              : `${operation.op} this cell`,
            'content' in operation ? operation.content : undefined,
            'proposed',
            operation.op === 'insert'
          );
        }
      }
    } catch (error) {
      this.rejectWriting(name, input);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  private reserve(
    cellId: string,
    expected: string,
    intent: string | undefined,
    draft: string | undefined,
    phase: 'proposed' | 'generating',
    anchorOnly = false,
    insertion?: CellInsertion
  ) {
    const { cell, version } = this.read(cellId);
    if (version !== expected)
      throw new Error('VERSION_CONFLICT: re-read the cell before proposing an edit.');
    if (
      !anchorOnly &&
      (cell.enableEdit === false || !['code', 'markdown', 'raw', 'hybrid'].includes(cell.type))
    )
      throw new Error('This cell cannot be edited by an agent');
    const edit = new CellContentEdit(cell, insertion);
    const current = agentWriting.forCell(this.notebookId, cellId);
    const operation = agentWriting.propose(
      this.writing,
      cellId,
      intent ?? (current?.ownerId === this.writing.ownerId ? current.intent : 'Update this cell'),
      draft === undefined ? undefined : edit.apply(draft)
    );
    this.edits.set(cellId, operation.id);
    if (phase === 'generating') agentWriting.transition(operation.id, phase);
    return operation.id;
  }
  private clearWriting(cellIds: readonly string[]) {
    for (const cellId of cellIds) {
      const id = this.edits.get(cellId);
      if (id) agentWriting.finish(id);
      this.edits.delete(cellId);
    }
  }
  private commitWriting<T>(write: () => T, cellIds: readonly string[]): T {
    const ids = cellIds.flatMap((cellId) => {
      const id = this.edits.get(cellId);
      return id ? [id] : [];
    });
    this.assertOwner();
    try {
      return agentWriting.commit(ids, write);
    } finally {
      cellIds.forEach((cellId) => this.edits.delete(cellId));
    }
  }
  async execute(name: ToolName, input: unknown): Promise<ToolResult> {
    try {
      this.assertOwner();
      if (!(name in toolsForRole(this.role)))
        throw new Error('Tool unavailable for this agent role');
      const args = toolSchemas[name].parse(input);
      if (name === 'apply_notebook_edits') {
        this.outlining = toolSchemas.apply_notebook_edits.parse(input).outline === true;
        if (
          this.outlining &&
          toolSchemas.apply_notebook_edits.parse(input).operations.some((op) => op.op !== 'insert')
        )
          throw new Error('Outline batches only support new section insertions');
        const error = this.prepareWriting(name, input);
        if (error) return error;
      }
      if (name in documentToolSchemas) {
        if (!this.document) throw new Error('Notebook document service unavailable');
        return { ok: true, data: await this.document.execute(name as DocumentToolName, args) };
      }
      if (name === 'read_context' || name === 'curate_context') {
        if (!this.ports.readContext || !this.ports.curateContext)
          throw new Error('Notebook context service unavailable');
        const data =
          name === 'read_context'
            ? await this.ports.readContext(
                toolSchemas.read_context.parse(input).path,
                this.signal,
                toolSchemas.read_context.parse(input).offset
              )
            : await this.ports.curateContext(toolSchemas.curate_context.parse(input), this.signal);
        this.assertOwner();
        return { ok: true, data };
      }
      if (name === 'cancel_cell_edit') {
        const { cellId } = toolSchemas.cancel_cell_edit.parse(input);
        const id = this.edits.get(cellId);
        if (id) agentWriting.finish(id);
        this.edits.delete(cellId);
        return { ok: true, data: { released: true, cellId } };
      }
      if (name === 'propose_cell_edit') {
        const proposal = toolSchemas.propose_cell_edit.parse(input);
        this.requireDetail(proposal.cellId);
        const operationId = this.reserve(
          proposal.cellId,
          proposal.version,
          proposal.intent,
          proposal.draft,
          proposal.stage === 'planned' ? 'proposed' : 'generating',
          false,
          proposal.insertion
        );
        return { ok: true, data: { operationId, cellId: proposal.cellId, reserved: true } };
      }
      if (name === 'list_cells') return { ok: true, data: this.index() };
      if (name === 'summary') {
        const { text, cellIds } = toolSchemas.summary.parse(args);
        for (const id of cellIds) this.read(id);
        this.ports.summary(text, cellIds);
        return { ok: true, data: { saved: true, text, cellIds } };
      }
      const { cellId } = args as { cellId: string };
      const { cell, version } = this.read(cellId);
      if (name === 'read_cell') {
        this.detailReads.set(cellId, version);
        return {
          ok: true,
          data: {
            cellId,
            type: cell.type,
            language: cell.language,
            version,
            documentLineNumber: this.ports.cells().findIndex((item) => item.id === cellId) + 1,
            ...cellSourceDetail(
              cell.type === 'agent' ? cell.metadata?.agent?.summary?.text || '' : cell.content
            ),
            outputs: cell.outputs ?? [],
          },
        };
      }
      const mutation =
        name === 'update_cell'
          ? toolSchemas.update_cell.parse(input)
          : toolSchemas.run_cell.parse(input);
      if (mutation.version !== version)
        throw new Error(
          'VERSION_CONFLICT: cell changed since it was read. Read it again before editing or running.'
        );
      if (cell.enableEdit === false) throw new Error('Cell is read-only');
      if (name === 'update_cell') {
        this.requireDetail(cellId);
        if (!['code', 'markdown', 'raw', 'hybrid'].includes(cell.type))
          throw new Error('This cell type cannot be edited by an agent');
        const edit = toolSchemas.update_cell.parse(args);
        const content = new CellContentEdit(cell, edit.insertion).apply(edit.content);
        if (!this.edits.has(cellId)) this.reserve(cellId, version, undefined, content, 'proposed');
        await agentWriting.awaitPresentation(this.edits.get(cellId)!);
        this.assertOwner();
        if (this.read(cellId).version !== version)
          throw new Error('VERSION_CONFLICT: re-read before commit');
        this.requireDetail(cellId);
        this.commitWriting(() => this.ports.update(cellId, content), [cellId]);
        return { ok: true, data: { cellId, version: this.read(cellId).version } };
      }
      if (cell.type !== 'code') throw new Error('Only code cells can run');
      if (this.executing || this.ports.busy()) throw new Error('Notebook kernel is busy');
      this.executing = cellId;
      try {
        const result = await this.runCell(cellId);
        this.assertOwner();
        const current = this.read(cellId);
        if (current.version !== version)
          throw new Error(
            'VERSION_CONFLICT: cell changed during execution; result belongs to the earlier version'
          );
        const execution = result as { success?: boolean; error?: string } | undefined;
        return {
          ok: execution?.success === true,
          ...(execution?.success === true
            ? {}
            : { error: execution?.error || 'Cell execution failed' }),
          data: { result, cellId, version, outputs: current.cell.outputs ?? [] },
        };
      } finally {
        this.executing = undefined;
      }
    } catch (error) {
      if (name === 'update_cell' || name === 'apply_notebook_edits')
        this.rejectWriting(name, input);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort();
    this.unsubscribe();
    this.signal.removeEventListener('abort', this.abort);
  }
}
