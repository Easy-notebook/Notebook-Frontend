import { submissionActivity, type SubmissionActivity } from './SubmissionActivity';

export interface CommandDraftState {
  value: string;
  pending: boolean;
}
/** Submission owns a text revision; success may only clear that unchanged revision. */
export class CommandDraft {
  private state: CommandDraftState = { value: '', pending: false };
  private revision = 0;
  private epoch = 0;
  private active = false;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly activity: SubmissionActivity = submissionActivity) {}
  getSnapshot = (): CommandDraftState => this.state;
  subscribe = (notify: () => void): (() => void) => {
    this.listeners.add(notify);
    return () => this.listeners.delete(notify);
  };
  private publish(state: CommandDraftState): void {
    this.state = state;
    this.listeners.forEach((notify) => notify());
  }
  attach(): void {
    this.active = true;
  }
  detach(): void {
    this.active = false;
    this.reset();
  }
  reset(): void {
    this.epoch++;
    this.revision++;
    this.publish({ value: '', pending: false });
  }
  setValue = (update: string | ((previous: string) => string)): void => {
    if (!this.active) return;
    const value = typeof update === 'function' ? update(this.state.value) : update;
    if (value === this.state.value) return;
    this.revision++;
    this.publish({ ...this.state, value });
  };
  async submit(
    execute: (command: string) => Promise<boolean>,
    reportError: (error: unknown) => void
  ): Promise<void> {
    const command = this.state.value.trim();
    if (!this.active || this.state.pending || !command) return;
    const epoch = this.epoch;
    const revision = this.revision;
    const current = () => this.active && this.epoch === epoch;
    this.publish({ ...this.state, pending: true });
    if (!current()) return;
    const release = this.activity.begin();
    try {
      if (!current()) return;
      const accepted = await execute(command);
      if (current() && accepted && this.revision === revision) this.setValue('');
    } catch (error) {
      if (current()) reportError(error);
    } finally {
      release();
      if (current()) this.publish({ ...this.state, pending: false });
    }
  }
}
