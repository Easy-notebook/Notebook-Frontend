interface SaveTicket {
  readonly id: symbol;
  readonly revision: number;
  readonly content: string;
}

type SaveState = { phase: 'ready' | 'failed' } | { phase: 'saving'; ticket: SaveTicket };

/** Owns save acknowledgements and distinguishes our commit echo from a new document source. */
export class SpreadsheetSaveSession {
  private source: { key: string; content: string } | null = null;
  private revision = 0;
  private state: SaveState = { phase: 'ready' };
  private committedEcho: string | null = null;

  receiveSource(key: string | null, content: string): boolean {
    if (key !== null && this.source?.key === key) {
      if (this.source.content === content) return false;
      const savingContent = this.state.phase === 'saving' ? this.state.ticket.content : null;
      if (content === savingContent || content === this.committedEcho) {
        this.source = { key, content };
        return false;
      }
    }
    this.close();
    this.source = key === null ? null : { key, content };
    return true;
  }

  changed(): void {
    this.revision++;
  }

  begin(content: string): SaveTicket {
    if (!this.source) throw new Error('Spreadsheet session is not loaded');
    const ticket = Object.freeze({
      id: Symbol('spreadsheet-save'),
      revision: this.revision,
      content,
    });
    this.state = { phase: 'saving', ticket };
    return ticket;
  }

  complete(ticket: SaveTicket, committedContent: string | null): boolean {
    if (this.state.phase !== 'saving' || this.state.ticket !== ticket) return false;
    const accepted = committedContent !== null && committedContent === ticket.content;
    this.state = { phase: accepted ? 'ready' : 'failed' };
    if (accepted) this.committedEcho = committedContent;
    return accepted && this.revision === ticket.revision;
  }

  close(): void {
    this.source = null;
    this.state = { phase: 'ready' };
    this.committedEcho = null;
    this.revision++;
  }
}
