import type { Cell } from '@Store/models';

export type WritingPhase = 'proposed' | 'generating' | 'applying';
export interface WritingApproval {
  resolve(decision: 'approve' | 'reject'): void;
}
export interface WritingIdentity {
  notebookId: string;
  ownerId: string;
  name: string;
  color: string;
}
export interface WritingOperation extends WritingIdentity {
  id: string;
  cellId: string;
  intent: string;
  draft?: string;
  phase: WritingPhase;
  outline?: boolean;
  approval?: WritingApproval;
}
/** Reservations may cover many cells; one author has only one current writing position. */
export function focusedWritingIds(operations: readonly WritingOperation[]) {
  const owners = new Map<string, WritingOperation>();
  for (const operation of operations) {
    if (
      operation.outline &&
      !operation.intent &&
      operation.phase === 'proposed' &&
      !operation.approval
    )
      continue;
    const key = JSON.stringify([operation.notebookId, operation.ownerId]);
    const previous = owners.get(key);
    if (!previous?.approval || operation.approval) owners.set(key, operation);
  }
  return new Set(Array.from(owners.values(), (operation) => operation.id));
}
export class WritingConflict extends Error {
  constructor(readonly cellId: string) {
    super('AGENT_EDIT_LOCKED: this cell is being edited by an agent.');
  }
}
/** Authoring fields only: execution output and runtime metadata remain independently writable. */
function authored(cell: Cell) {
  return JSON.stringify([
    cell.type,
    cell.content,
    cell.language,
    cell.enableEdit,
    cell.metadata?.editorMode,
    cell.metadata?.sourceCellType,
  ]);
}

/** Ephemeral, notebook-scoped operations. No document data or persistence lives here. */
export class AgentWriting {
  private operations: readonly WritingOperation[] = [];
  private listeners = new Set<() => void>();
  private committing = new Set<string>();
  private presentations = new Map<string, () => Promise<void>>();
  present(id: string, settle: () => Promise<void>) {
    this.presentations.set(id, settle);
    return () => {
      if (this.presentations.get(id) === settle) this.presentations.delete(id);
    };
  }
  async awaitPresentation(id: string) {
    await this.presentations.get(id)?.();
  }
  outline(id: string) {
    this.publish(
      this.operations.map((item) => (item.id === id ? { ...item, outline: true } : item))
    );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.operations;
  bindApproval(ids: readonly string[], approval: WritingApproval) {
    this.publish(
      this.operations.map((item) => (ids.includes(item.id) ? { ...item, approval } : item))
    );
    return () =>
      this.publish(
        this.operations.map((item) => {
          if (item.approval !== approval) return item;
          const { approval: removed, ...rest } = item;
          void removed;
          return rest;
        })
      );
  }
  private publish(next: readonly WritingOperation[]) {
    this.operations = next;
    for (const listener of this.listeners) listener();
  }
  forCell(notebookId: string | null, cellId: string) {
    return this.operations.find((item) => item.notebookId === notebookId && item.cellId === cellId);
  }
  propose(identity: WritingIdentity, cellId: string, intent: string, draft?: string) {
    const current = this.forCell(identity.notebookId, cellId);
    if (current && current.ownerId !== identity.ownerId) throw new WritingConflict(cellId);
    if (current?.phase === 'applying') throw new Error('Writing operation is already applying');
    const operation: WritingOperation = {
      ...identity,
      id: current?.id ?? crypto.randomUUID(),
      cellId,
      intent,
      draft,
      phase: 'proposed',
      ...(current?.outline ? { outline: true } : {}),
    };
    this.publish([...this.operations.filter((item) => item.id !== operation.id), operation]);
    return operation;
  }
  transition(id: string, phase: WritingPhase) {
    const current = this.operations.find((item) => item.id === id);
    if (!current) throw new Error('Writing operation no longer exists');
    const allowed: Record<WritingPhase, WritingPhase[]> = {
      proposed: ['generating', 'applying'],
      generating: ['proposed', 'applying'],
      applying: [],
    };
    if (current.phase !== phase && !allowed[current.phase].includes(phase))
      throw new Error(`Invalid writing transition ${current.phase} → ${phase}`);
    this.publish(this.operations.map((item) => (item.id === id ? { ...item, phase } : item)));
  }
  finish(id: string) {
    if (this.operations.some((item) => item.id === id))
      this.publish(this.operations.filter((item) => item.id !== id));
  }
  releaseOwner(ownerId: string) {
    const next = this.operations.filter((item) => item.ownerId !== ownerId);
    if (next.length !== this.operations.length) this.publish(next);
  }
  /** Authority is restricted to this synchronous commit, never across an await. */
  commit<T>(ids: readonly string[], write: () => T): T {
    for (const id of ids) {
      if (!this.operations.some((item) => item.id === id)) throw new Error('Writing lease expired');
    }
    for (const id of ids) this.transition(id, 'applying');
    ids.forEach((id) => this.committing.add(id));
    try {
      return write();
    } finally {
      ids.forEach((id) => this.committing.delete(id));
      ids.forEach((id) => this.finish(id));
    }
  }
  assertMutation(notebookId: string | null, before: readonly Cell[], after: readonly Cell[]) {
    const locks = this.operations.filter(
      (item) => item.notebookId === notebookId && !this.committing.has(item.id)
    );
    if (!locks.length || before === after) return;
    const old = new Map(before.map((cell) => [cell.id, cell]));
    const next = new Map(after.map((cell) => [cell.id, cell]));
    const oldOrder = before.filter((cell) => next.has(cell.id)).map((cell) => cell.id);
    const newOrder = after.filter((cell) => old.has(cell.id)).map((cell) => cell.id);
    for (const lock of locks) {
      const a = old.get(lock.cellId),
        b = next.get(lock.cellId);
      if (!a || !b || authored(a) !== authored(b)) throw new WritingConflict(lock.cellId);
      const previous = new Set(oldOrder.slice(0, oldOrder.indexOf(lock.cellId)));
      const following = newOrder.slice(0, newOrder.indexOf(lock.cellId));
      if (previous.size !== following.length || following.some((id) => !previous.has(id)))
        throw new WritingConflict(lock.cellId);
    }
  }
}
export const agentWriting = new AgentWriting();
