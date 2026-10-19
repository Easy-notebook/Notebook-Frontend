import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';
import type { PersistedState, Settings } from '@Store/models/settings';
import { SettingsPersistenceStorage } from './SettingsPersistenceStorage';

const settings = (): Settings => ({
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  apiTimeout: 30000,
  markdownPreferences: { autoFormat: true, syntaxHighlighting: true, lineNumbers: false },
  editorSettings: {
    editorType: 'tiptap',
    defaultLanguage: 'python',
    kernel: 'local',
    autoSave: true,
    autoComplete: true,
    autoFormat: true,
    showLineNumbers: true,
  },
  shortcuts: {
    newCell: 'Ctrl+Enter',
    runCell: 'Shift+Enter',
    deleteCell: 'Ctrl+D',
    formatCode: 'Alt+F',
    saveFile: 'Ctrl+S',
  },
  theme: 'system',
  language: 'zh',
  syncEnabled: false,
  lastSyncTime: null,
});
const envelope = (language = 'zh') => ({
  state: { settings: { ...settings(), language } },
  version: 2,
});
const encode = async (text: string) => `encoded:${text}`;
const decode = async (text: string) => {
  if (!text.startsWith('encoded:')) throw new Error('invalid ciphertext');
  return text.slice(8);
};
function setup(overrides = {}) {
  const readBackup = vi.fn().mockResolvedValue(null);
  const writeBackup = vi.fn().mockResolvedValue(undefined);
  const storage = new SettingsPersistenceStorage({
    storage: () => localStorage,
    readBackup,
    writeBackup,
    pruneBackups: vi.fn(),
    version: 2,
    encrypt: encode,
    decrypt: decode,
    ...overrides,
  });
  return { storage, readBackup, writeBackup };
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('round-trips the Zustand envelope and encrypts both main and backup values without mutating input', async () => {
  const { storage, writeBackup } = setup();
  const input = envelope();
  await storage.setItem('settings', input);
  expect(JSON.parse(localStorage.getItem('settings')!)).toMatchObject({
    version: 2,
    state: { settings: { apiKey: 'encoded:test-key' } },
  });
  expect(writeBackup).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'encoded:test-key' }));
  expect(input.state.settings.apiKey).toBe('test-key');
  expect(await storage.getItem('settings')).toEqual(input);
});

it('hydrates an actual Zustand store with plaintext runtime settings', async () => {
  const { storage } = setup();
  await storage.setItem('settings', envelope('en'));
  const store = createStore<{ settings: Settings }>()(
    persist(() => ({ settings: settings() }), {
      name: 'settings',
      version: 2,
      storage,
      skipHydration: true,
      partialize: (state) => ({ settings: state.settings }) satisfies PersistedState,
    })
  );
  await store.persist.rehydrate();
  expect(store.getState().settings).toMatchObject({ language: 'en', apiKey: 'test-key' });
});

it('serializes writes and captures nested input before awaiting encryption', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const encrypt = vi
    .fn()
    .mockImplementationOnce(async (text) => {
      await gate;
      return encode(text);
    })
    .mockImplementation(encode);
  const { storage, writeBackup } = setup({ encrypt });
  const input = envelope('first');
  const first = storage.setItem('settings', input);
  input.state.settings.language = 'mutated';
  const second = storage.setItem('settings', envelope('second'));
  await Promise.resolve();
  expect(encrypt).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, second]);
  expect(writeBackup.mock.calls[0][0].language).toBe('first');
  expect((await storage.getItem('settings'))?.state.settings?.language).toBe('second');
});

it('orders removal after an admitted write and allows retry after an encryption failure', async () => {
  const encrypt = vi
    .fn()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockImplementation(encode);
  const { storage } = setup({ encrypt });
  await expect(storage.setItem('settings', envelope())).rejects.toThrow('unavailable');
  const write = storage.setItem('settings', envelope());
  const removal = storage.removeItem('settings');
  await Promise.all([write, removal]);
  expect(localStorage.getItem('settings')).toBeNull();
});

it('recovers a backup through the same envelope and decryption boundary without overwriting corrupt primary data', async () => {
  const { storage, readBackup } = setup();
  localStorage.setItem('settings', 'corrupt');
  readBackup.mockResolvedValue({ settings: { ...settings(), apiKey: 'encoded:test-key' } });
  expect(await storage.getItem('settings')).toEqual(envelope());
  expect(localStorage.getItem('settings')).toBe('corrupt');
});

it('rejects unreadable settings when no recovery copy exists instead of returning an empty state', async () => {
  const { storage } = setup();
  localStorage.setItem(
    'settings',
    JSON.stringify({ state: { settings: { apiKey: 4 } }, version: 2 })
  );
  await expect(storage.getItem('settings')).rejects.toThrow('Invalid persisted settings payload');
});

it('limits quota recovery to settings backups and preserves other application data', async () => {
  localStorage.setItem('settings', 'previous');
  localStorage.setItem('easy-notebook-document', 'keep');
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  const remove = vi.spyOn(Storage.prototype, 'removeItem');
  const pruneBackups = vi.fn().mockResolvedValue(undefined);
  const { storage } = setup({ pruneBackups });
  await expect(storage.setItem('settings', envelope())).rejects.toThrow('full');
  expect(write).toHaveBeenCalledTimes(2);
  expect(pruneBackups).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
  expect(localStorage.getItem('settings')).toBe('previous');
  expect(localStorage.getItem('easy-notebook-document')).toBe('keep');
});

it('rejects future records before decryption or backup recovery and permits writes after external repair', async () => {
  const encrypt = vi.fn(encode);
  const decrypt = vi.fn(decode);
  const { storage, readBackup, writeBackup } = setup({ encrypt, decrypt });
  const future = JSON.stringify({ version: 3, state: { unknownFutureSchema: true } });
  localStorage.setItem('settings', future);
  await expect(storage.getItem('settings')).rejects.toMatchObject({
    name: 'UnsupportedSettingsVersionError',
    storedVersion: 3,
    supportedVersion: 2,
  });
  await expect(storage.setItem('settings', envelope())).rejects.toThrow('Settings version 3');
  expect(localStorage.getItem('settings')).toBe(future);
  expect(decrypt).not.toHaveBeenCalled();
  expect(encrypt).not.toHaveBeenCalled();
  expect(readBackup).not.toHaveBeenCalled();
  expect(writeBackup).not.toHaveBeenCalled();
  localStorage.removeItem('settings');
  await storage.setItem('settings', envelope());
  expect(await storage.getItem('settings')).toEqual(envelope());
});

it.each(['encryption', 'backup', 'quota retry'])(
  'preserves future data appearing during %s',
  async (stage) => {
    const future = JSON.stringify({ version: 3, state: { unknownFutureSchema: true } });
    const replace = () => localStorage.setItem('settings', future);
    const writeBackup = vi.fn(async () => {
      if (stage === 'backup') replace();
    });
    const { storage } = setup({
      encrypt: async (text: string) => {
        if (stage === 'encryption') replace();
        return encode(text);
      },
      writeBackup,
      pruneBackups: async () => {
        replace();
      },
    });
    if (stage === 'quota retry') {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
    }
    await expect(storage.setItem('settings', envelope())).rejects.toThrow('Settings version 3');
    expect(localStorage.getItem('settings')).toBe(future);
    if (stage === 'encryption') expect(writeBackup).not.toHaveBeenCalled();
  }
);
