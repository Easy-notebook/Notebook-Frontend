interface DeferredEditTicket {
  readonly revision: number;
}

interface SaveTicket {
  readonly id: symbol;
  readonly revision: number;
  readonly content: string;
}

type SaveState = { phase: 'ready' | 'failed' } | { phase: 'saving'; ticket: SaveTicket };

/** Owns revision-scoped deferred edits, save acknowledgements and committed source echoes. */
export class SpreadsheetEditSession {
  private deferredEdit: DeferredEditTicket | null = null;
  private source: { key: string; content: string } | null = null;
  private revision = 0;
  private state: SaveState = { phase: 'ready' };
  private committedEcho: string | null = null;

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
    this.close();
    this.source = key === null ? null : { key, content };
    return true;
  }

  changed(): void {
    this.revision++;
    this.deferredEdit = null;
  }

  beginSave(content: string): SaveTicket {
    if (!this.source) throw new Error('Spreadsheet session is not loaded');
    const ticket = Object.freeze({
      id: Symbol('spreadsheet-save'),
      revision: this.revision,
      content,
    });
    this.state = { phase: 'saving', ticket };
    return ticket;
  }

  completeSave(ticket: SaveTicket, committedContent: string | null): boolean {
    if (this.state.phase !== 'saving' || this.state.ticket !== ticket) return false;
    const accepted = committedContent !== null && committedContent === ticket.content;
    this.state = { phase: accepted ? 'ready' : 'failed' };
    if (accepted) this.committedEcho = committedContent;
    return accepted && this.revision === ticket.revision;
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
    this.deferredEdit = null;
    this.source = null;
    this.state = { phase: 'ready' };
    this.committedEcho = null;
    this.revision++;
  }
}
