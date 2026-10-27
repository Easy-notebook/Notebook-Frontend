interface DeferredEditTicket {
  readonly revision: number;
}

interface SaveTicket {
  readonly id: symbol;
  readonly revision: number;
  readonly content: string;
}

export type SpreadsheetSaveStatus =
  | { readonly phase: 'ready' | 'saving' | 'saved' }
  | { readonly phase: 'failed'; readonly message: string };

type SaveState =
  | { phase: 'ready' | 'saved' }
  | { phase: 'failed'; message: string }
  | { phase: 'saving'; ticket: SaveTicket };

/** Owns revision-scoped deferred edits, save acknowledgements and committed source echoes. */
export class SpreadsheetEditSession {
  private deferredEdit: DeferredEditTicket | null = null;
  private source: { key: string; content: string } | null = null;
  private revision = 0;
  private state: SaveState = Object.freeze({ phase: 'ready' });
  private readonly listeners = new Set<() => void>();
  private committedEcho: string | null = null;

  getSnapshot = (): SpreadsheetSaveStatus => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: SaveState): void {
    this.state = Object.freeze(state);
    for (const listener of [...this.listeners]) listener();
  }

  ownsSave(ticket: SaveTicket): boolean {
    return this.state.phase === 'saving' && this.state.ticket === ticket;
  }

  /** Pure admission check shared by the React lifetime boundary and source loading. */
  retainsDraft(key: string | null, content: string): boolean {
    if (key === null || this.source?.key !== key) return false;
    const savingContent = this.state.phase === 'saving' ? this.state.ticket.content : null;
    return (
      this.source.content === content || content === savingContent || content === this.committedEcho
    );
  }

  receiveSource(key: string | null, content: string): boolean {
    if (key !== null && this.retainsDraft(key, content)) {
      this.source = { key, content };
      return false;
    }
    this.resetSource(key, content);
    return true;
  }

  changed(): void {
    this.revision++;
    this.deferredEdit = null;
    if (this.state.phase === 'saved') this.publish({ phase: 'ready' });
  }

  beginSave(content: string): SaveTicket {
    if (!this.source) throw new Error('Spreadsheet session is not loaded');
    const ticket = Object.freeze({
      id: Symbol('spreadsheet-save'),
      revision: this.revision,
      content,
    });
    this.publish({ phase: 'saving', ticket });
    return ticket;
  }

  completeSave(ticket: SaveTicket, committedContent: string | null): boolean {
    if (!this.ownsSave(ticket)) return false;
    const accepted = committedContent !== null && committedContent === ticket.content;
    if (accepted) this.committedEcho = committedContent;
    const state: SaveState = accepted
      ? { phase: this.revision === ticket.revision ? 'saved' : 'ready' }
      : {
          phase: 'failed',
          message: 'Save was not confirmed. Your edits are still here. Use Save to retry.',
        };
    this.publish(state);
    // Subscribers may edit, close the source, or start another save synchronously.
    return accepted && this.revision === ticket.revision && this.state === state;
  }

  failSave(ticket: SaveTicket | null, message: string): void {
    if (ticket && !this.ownsSave(ticket)) return;
    this.publish({ phase: 'failed', message });
  }

  beginDeferredEdit(): DeferredEditTicket | null {
    if (!this.source) return null;
    const ticket = Object.freeze({ revision: this.revision });
    this.deferredEdit = ticket;
    return ticket;
  }

  completeDeferredEdit(ticket: DeferredEditTicket, succeeded: boolean): boolean {
    if (this.deferredEdit !== ticket) return false;
    this.deferredEdit = null;
    return succeeded && this.source !== null && this.revision === ticket.revision;
  }

  close(): void {
    this.resetSource(null, '');
  }

  private resetSource(key: string | null, content: string): void {
    this.deferredEdit = null;
    this.source = key === null ? null : { key, content };
    this.committedEcho = null;
    this.revision++;
    this.publish({ phase: 'ready' });
  }
}
