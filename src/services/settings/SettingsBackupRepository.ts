import type { SettingsWithTimestamp } from '@Store/models/settings';

/** Owns backup discovery, retention and candidate recovery; callers own decoding. */
export class SettingsBackupRepository {
  constructor(
    private readonly storage: () => Storage,
    private readonly prefix: string,
    private readonly report: (error: unknown) => void,
    private readonly now: () => number = Date.now
  ) {}

  private keys(): string[] {
    return Object.keys(this.storage())
      .filter((key) => {
        if (!key.startsWith(`${this.prefix}-`)) return false;
        const suffix = key.slice(this.prefix.length + 1);
        return /^\d+$/.test(suffix) && Number.isSafeInteger(Number(suffix));
      })
      .sort((a, b) => this.timestamp(b) - this.timestamp(a));
  }

  private timestamp(key: string): number {
    return Number(key.slice(this.prefix.length + 1));
  }

  async prune(): Promise<void> {
    for (const key of this.keys().slice(2)) this.storage().removeItem(key);
  }

  async create(settings: SettingsWithTimestamp): Promise<void> {
    try {
      const newest = this.keys()[0];
      const timestamp = Math.max(this.now(), newest === undefined ? 0 : this.timestamp(newest) + 1);
      if (!Number.isSafeInteger(timestamp)) throw new Error('Invalid settings backup timestamp');
      this.storage().setItem(`${this.prefix}-${timestamp}`, JSON.stringify(settings));
      await this.prune();
    } catch (error) {
      // Backups remain best-effort; primary persistence owns durability acknowledgement.
      this.report(error);
    }
  }

  async restore<T>(decode: (state: unknown) => Promise<T>): Promise<T | null> {
    for (const key of this.keys()) {
      const raw = this.storage().getItem(key);
      if (raw === null) continue;
      try {
        return await decode({ settings: JSON.parse(raw) });
      } catch (error) {
        this.report(error);
      }
    }
    return null;
  }
}
