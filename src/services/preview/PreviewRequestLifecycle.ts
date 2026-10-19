type RequestState = { phase: 'idle' | 'ready' | 'failed' } | { phase: 'loading'; ticket: symbol };

/** Owns publication rights for one replaceable asynchronous preview request. */
export class PreviewRequestLifecycle {
  private state: RequestState = { phase: 'idle' };

  begin(): symbol {
    const ticket = Symbol('preview-request');
    this.state = { phase: 'loading', ticket };
    return ticket;
  }

  isCurrent(ticket: symbol): boolean {
    return this.state.phase === 'loading' && this.state.ticket === ticket;
  }

  settle(ticket: symbol, phase: 'ready' | 'failed'): boolean {
    if (!this.isCurrent(ticket)) return false;
    this.state = { phase };
    return true;
  }

  cancel(ticket?: symbol): boolean {
    if (ticket !== undefined && !this.isCurrent(ticket)) return false;
    this.state = { phase: 'idle' };
    return true;
  }
}
