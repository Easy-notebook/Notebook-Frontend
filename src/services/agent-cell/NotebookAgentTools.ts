import { NotebookDocumentTools, type NotebookDocumentPorts } from './NotebookDocumentTools';
import { documentToolSchemas, type DocumentToolName } from './documentProtocol';
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
  private readonly revisions = new Map<string, { fingerprint: string; token: string }>();
  private readonly unsubscribe: () => void;
  private executing?: string;
  private disposed = false;
  private readonly document?: NotebookDocumentTools;
  constructor(
    private readonly notebookId: string,
    private readonly agentCellId: string,
    private readonly ports: NotebookAgentPorts,
    private readonly signal: AbortSignal,
    private readonly role: AgentRole = 'worker'
  ) {
    if (ports.document)
      this.document = new NotebookDocumentTools(ports.document, () => this.assertOwner(), signal);
    this.refresh();
    this.unsubscribe = ports.watch(() => this.refresh());
    signal.addEventListener('abort', this.abort, { once: true });
  }
  private abort = () => {
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
      cellId: cell.id,
      index,
      type: cell.type,
      language: cell.language,
      version: this.revisions.get(cell.id)!.token,
      preview: cell.type === 'agent' ? '[Agent conversation]' : cell.content.slice(0, 400),
    }));
  }
  private read(cellId: string) {
    this.assertOwner();
    this.refresh();
    const cell = this.ports.cells().find((cell) => cell.id === cellId);
    if (!cell) throw new Error('Cell no longer exists');
    return { cell, version: this.revisions.get(cellId)!.token };
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
  async execute(name: ToolName, input: unknown): Promise<ToolResult> {
    try {
      this.assertOwner();
      if (!(name in toolsForRole(this.role)))
        throw new Error('Tool unavailable for this agent role');
      const args = toolSchemas[name].parse(input);
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
      if (name === 'list_cells') return { ok: true, data: this.index() };
      if (name === 'summary') {
        const { text, cellIds } = toolSchemas.summary.parse(args);
        for (const id of cellIds) this.read(id);
        this.ports.summary(text, cellIds);
        return { ok: true, data: { saved: true, text, cellIds } };
      }
      const { cellId } = args as { cellId: string };
      const { cell, version } = this.read(cellId);
      if (name === 'read_cell')
        return {
          ok: true,
          data: {
            cellId,
            type: cell.type,
            language: cell.language,
            version,
            content:
              cell.type === 'agent' ? cell.metadata?.agent?.summary?.text || '' : cell.content,
            outputs: cell.outputs ?? [],
          },
        };
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
        if (!['code', 'markdown', 'raw', 'hybrid'].includes(cell.type))
          throw new Error('This cell type cannot be edited by an agent');
        this.ports.update(cellId, toolSchemas.update_cell.parse(args).content);
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
