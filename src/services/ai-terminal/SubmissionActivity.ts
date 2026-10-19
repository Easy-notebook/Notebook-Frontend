import { useAIAgentStore } from '@Store/AIAgentStore';

/** Each admitted command owns one loading lease until its admission work settles. */
export class SubmissionActivity {
  private readonly pending = new Set<symbol>();
  constructor(private readonly publish: (loading: boolean) => void) {}
  begin(): () => void {
    const token = Symbol('submission');
    this.pending.add(token);
    if (this.pending.size === 1) this.publish(true);
    return () => {
      if (!this.pending.delete(token)) return;
      if (this.pending.size === 0) this.publish(false);
    };
  }
}
export const submissionActivity = new SubmissionActivity((loading) =>
  useAIAgentStore.getState().setIsLoading(loading)
);
