import { readSettingsRecord } from './SettingsRecord';
import type { Settings } from '@Store/models/settings';

/** Routes preference mutations to persistence and errors to transient state only. */
export class SettingsUpdateController {
  private revision = 0;

  constructor(
    private readonly read: () => Settings,
    private readonly persist: (settings: Settings) => unknown,
    private readonly report: (message: string | null) => void
  ) {}

  update(change: (settings: Settings) => Settings): Promise<void> {
    const revision = ++this.revision;
    const failed = (error: unknown) => {
      if (revision === this.revision)
        this.report(error instanceof Error ? error.message : String(error));
    };
    try {
      const next = readSettingsRecord(change(this.read()));
      this.report(null);
      const operation = Promise.resolve(this.persist(next)).then(() => undefined);
      // Observe failures for void UI actions while preserving rejection for awaiting callers.
      void operation.catch(failed);
      return operation;
    } catch (error) {
      failed(error);
      throw error;
    }
  }
}
