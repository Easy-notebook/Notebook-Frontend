import type { UploadFile, VDSQuestion } from './types';

type Phase =
  | 'uploading'
  | 'preparing'
  | 'suggesting'
  | 'waiting'
  | 'complete'
  | 'cancelled'
  | 'failed';
interface Preparation {
  phase: Phase;
  stopWaiting?: () => void;
}
export interface PreparationEffects {
  upload(files: File[]): Promise<UploadFile[]>;
  accept(files: UploadFile[]): void;
  prepare(file: File): Promise<{ columns: string[]; info: string }>;
  suggest(columns: string[], info: string): Promise<unknown>;
  questions(questions: VDSQuestion[]): void;
  defaultQuestion(): void;
  navigate(): void;
  loading(value: boolean): void;
  error(error: unknown, stage: 'upload' | 'suggestion'): void;
}

/** One selected batch owns preparation, suggestions and navigation until replaced or cancelled. */
export class EmptyStatePreparationSession {
  private active = false;
  private current: Preparation | undefined;
  private effects: PreparationEffects | undefined;

  attach(): void {
    this.active = true;
  }
  detach(): void {
    this.active = false;
    this.cancel();
  }
  cancel(): void {
    const previous = this.current;
    const effects = this.effects;
    this.current = undefined;
    this.effects = undefined;
    if (previous) {
      previous.phase = 'cancelled';
      previous.stopWaiting?.();
      if (this.active) effects?.loading(false);
    }
  }
  private owns(request: Preparation): boolean {
    return this.active && this.current === request;
  }
  private wait(request: Preparation, delay: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        request.stopWaiting = undefined;
        resolve();
      }, delay);
      request.stopWaiting = () => {
        clearTimeout(timer);
        request.stopWaiting = undefined;
        resolve();
      };
    });
  }

  async run(input: File[], effects: PreparationEffects): Promise<void> {
    if (!this.active || !input.length) return;
    this.cancel();
    // Cancellation callbacks may synchronously start a newer request or detach the owner.
    if (!this.active || this.current) return;
    const files = [...input];
    const request: Preparation = { phase: 'uploading' };
    this.current = request;
    this.effects = effects;
    effects.loading(true);
    try {
      if (!this.owns(request)) return;
      const attachments = await effects.upload(files);
      if (!this.owns(request)) {
        attachments.forEach(({ url }) => URL.revokeObjectURL(url));
        return;
      }
      effects.accept(attachments);
      if (!this.owns(request)) return;
      request.phase = 'preparing';
      const csv = files.find((file) => /\.(csv|xlsx|xls)$/i.test(file.name));
      const context = await effects.prepare(csv || files[0]);
      if (!this.owns(request)) return;
      effects.loading(false);
      if (!this.owns(request)) return;
      if (csv) {
        request.phase = 'suggesting';
        const response = await effects.suggest(context.columns, context.info);
        if (!this.owns(request)) return;
        if (!Array.isArray(response) || !response.every(isQuestion))
          throw new Error('Invalid suggested questions response');
        effects.questions(response);
      } else {
        effects.defaultQuestion();
      }
      if (!this.owns(request)) return;
      request.phase = 'waiting';
      await this.wait(request, 500);
      if (!this.owns(request)) return;
      request.phase = 'complete';
      this.current = undefined;
      this.effects = undefined;
      effects.navigate();
    } catch (error) {
      if (this.owns(request)) {
        const stage = request.phase === 'suggesting' ? 'suggestion' : 'upload';
        request.phase = 'failed';
        effects.error(error, stage);
      }
    } finally {
      if (this.owns(request)) {
        this.current = undefined;
        this.effects = undefined;
        effects.loading(false);
      }
    }
  }
}
function isQuestion(value: unknown): value is VDSQuestion {
  return (
    typeof value === 'object' &&
    value !== null &&
    'problem_name' in value &&
    typeof value.problem_name === 'string' &&
    'problem_description' in value &&
    typeof value.problem_description === 'string'
  );
}
