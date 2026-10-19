import { readSettingsState } from './SettingsRecord';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { PersistedState, SettingsWithTimestamp } from '@Store/models/settings';
import { encrypt, decrypt } from '@Utils/encryption';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class UnsupportedSettingsVersionError extends Error {
  constructor(
    readonly storedVersion: number,
    readonly supportedVersion: number
  ) {
    super(`Settings version ${storedVersion} exceeds supported version ${supportedVersion}`);
    this.name = 'UnsupportedSettingsVersionError';
  }
}

export function assertSupportedSettingsVersion(version: unknown, supported: number): void {
  if (typeof version === 'number' && version > supported)
    throw new UnsupportedSettingsVersionError(version, supported);
}

interface SettingsStorageDependencies {
  storage: () => Storage;
  readBackup: (
    decode: (state: unknown) => Promise<PersistedState>
  ) => Promise<PersistedState | null>;
  writeBackup: (settings: SettingsWithTimestamp) => Promise<void>;
  pruneBackups: () => Promise<void>;
  version: number;
  encrypt?: (value: string) => Promise<string>;
  decrypt?: (value: string) => Promise<string>;
}

/** Serialized settings I/O. Runtime state stays plaintext; persisted credentials are encrypted. */
export class SettingsPersistenceStorage implements PersistStorage<PersistedState, Promise<void>> {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: SettingsStorageDependencies) {}

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.tail.then(work);
    this.tail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private async transform(
    state: PersistedState,
    direction: 'encrypt' | 'decrypt'
  ): Promise<PersistedState> {
    const captured = structuredClone(readSettingsState(state, direction === 'decrypt'));
    const settings = captured.settings!;
    const transform =
      direction === 'encrypt'
        ? (this.dependencies.encrypt ?? encrypt)
        : (this.dependencies.decrypt ?? decrypt);
    if (settings.apiKey) settings.apiKey = await transform(settings.apiKey);
    return captured;
  }

  private async backup(): Promise<StorageValue<PersistedState> | null> {
    const state = await this.dependencies.readBackup((candidate) =>
      this.transform(readSettingsState(candidate, false), 'decrypt')
    );
    return state === null
      ? null
      : {
          state,
          version: this.dependencies.version,
        };
  }

  private assertWritable(name: string): void {
    const raw = this.dependencies.storage().getItem(name);
    if (raw === null) return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      // Explicit saves may replace corrupt JSON after recovery.
      if (error instanceof SyntaxError) return;
      throw error;
    }
    if (object(value)) assertSupportedSettingsVersion(value.version, this.dependencies.version);
  }

  private commit(name: string, encoded: string): void {
    this.assertWritable(name);
    this.dependencies.storage().setItem(name, encoded);
  }

  getItem(name: string): Promise<StorageValue<PersistedState> | null> {
    return this.enqueue(async () => {
      try {
        const raw = this.dependencies.storage().getItem(name);
        if (raw === null) return this.backup();
        const value: unknown = JSON.parse(raw);
        if (
          !object(value) ||
          (value.version !== undefined &&
            (typeof value.version !== 'number' ||
              !Number.isSafeInteger(value.version) ||
              value.version < 0))
        )
          throw new Error('Invalid settings storage envelope');
        assertSupportedSettingsVersion(value.version, this.dependencies.version);
        return {
          state: await this.transform(
            readSettingsState(value.state, value.version !== this.dependencies.version),
            'decrypt'
          ),
          version: (value.version as number | undefined) ?? 0,
        };
      } catch (error) {
        if (error instanceof UnsupportedSettingsVersionError) throw error;
        const recovered = await this.backup();
        if (recovered) return recovered;
        throw error;
      }
    });
  }

  setItem(name: string, value: StorageValue<PersistedState>): Promise<void> {
    const captured = structuredClone(value);
    return this.enqueue(async () => {
      this.assertWritable(name);
      const state = await this.transform(captured.state, 'encrypt');
      this.assertWritable(name);
      const encoded = JSON.stringify({ ...captured, state });
      await this.dependencies.writeBackup(state.settings!);
      try {
        this.commit(name, encoded);
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error;
        await this.dependencies.pruneBackups();
        this.commit(name, encoded);
      }
    });
  }

  removeItem(name: string): Promise<void> {
    return this.enqueue(async () => {
      this.dependencies.storage().removeItem(name);
    });
  }

  createBackup(settings: SettingsWithTimestamp): Promise<void> {
    const captured = structuredClone(settings);
    return this.enqueue(async () => {
      const encoded = await this.transform({ settings: captured }, 'encrypt');
      await this.dependencies.writeBackup(encoded.settings!);
    });
  }

  restoreBackup(): Promise<PersistedState | null> {
    return this.enqueue(async () => (await this.backup())?.state ?? null);
  }
}
