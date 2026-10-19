import { SettingsStorageMaintenance } from '@Services/settings/SettingsStorageMaintenance';
import { ShortcutBinding } from '@Services/settings/ShortcutBinding';
import { readSettingsState } from '@Services/settings/SettingsRecord';
import { initialSettings } from '@Services/settings/SettingsDefaults';
import { SettingsBackupRepository } from '@Services/settings/SettingsBackupRepository';
// store/settingsStore.ts
import { create, type StoreApi, type StateCreator } from 'zustand';
import { SettingsUpdateController } from '@Services/settings/SettingsUpdateController';
import { persist, type PersistOptions } from 'zustand/middleware';
import {
  SettingsPersistenceStorage,
  assertSupportedSettingsVersion,
} from '@Services/settings/SettingsPersistenceStorage';
import { useMemo } from 'react';
import { storeLog } from '@Utils/logger';
import type {
  PlatformType,
  MarkdownPreferences,
  EditorSettings,
  Settings,
  SettingsWithTimestamp,
  PlatformKeyMappingConfig,
  PersistedState,
} from '@Store/models';

// Constants
const STORE_NAME = 'easy-notebook-settings';
const STORE_VERSION = 2;
const STORAGE_KEYS = {
  SETTINGS: 'easy-notebook-settings',
  BACKUP: 'easy-notebook-settings-backup',
} as const;

export interface SettingsStoreState {
  settings: Settings;
  settingsOpen: boolean;
  error: string | null;
}

/**
 * Settings Store Actions 接口
 */
export interface SettingsStoreActions {
  // Panel Controls
  openSettings: () => void;
  closeSettings: () => void;

  // Error Handling
  setError: (error: string | null) => void;
  clearError: () => void;

  // API Settings
  updateApiSettings: (params: {
    apiKey?: string;
    baseUrl?: string;
    apiTimeout?: number;
  }) => Promise<void>;

  // Markdown Preferences
  updateMarkdownPreferences: (preferences: Partial<MarkdownPreferences>) => void;

  // Editor Settings
  updateEditorSettings: (settings: Partial<EditorSettings>) => void;

  // Shortcuts
  updateShortcut: (key: string, value: string) => void;

  // Language
  updateLanguage: (language: string) => void;

  // Reset Settings
  resetSetting: (key: keyof Settings) => void;

  // Batch Update
  batchUpdateSettings: (updates: Partial<Settings>) => void;

  // Platform-specific shortcuts
  getPlatformShortcut: (shortcut: string) => string;
}

/**
 * 完整的 Settings Store 类型
 */
export type SettingsStore = SettingsStoreState & SettingsStoreActions;

// Optional: re-export key types for backward compatibility
export type {
  Settings,
  EditorSettings,
  MarkdownPreferences,
  Shortcuts,
  ThemeType,
  PlatformType,
  PersistedState,
} from '@Store/models';

// Platform-specific key mapping
const PLATFORM_KEY_MAPPING: PlatformKeyMappingConfig = {
  macos: {
    Ctrl: '⌘',
    Alt: '⌥',
    Meta: '⌘',
  },
  windows: {
    Ctrl: 'Ctrl',
    Alt: 'Alt',
    Meta: 'Win',
  },
  linux: {
    Ctrl: 'Ctrl',
    Alt: 'Alt',
    Meta: 'Super',
  },
  default: {
    Ctrl: 'Ctrl',
    Alt: 'Alt',
    Meta: 'Meta',
  },
};

const storageManager = new SettingsStorageMaintenance({
  storage: () => localStorage,
  estimate: async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage)
      return navigator.storage.estimate();
    return null;
  },
  report: (message, error) => storeLog.error(message, { error }),
});

// Utility Functions
const isValidUrl = (url: string): boolean => {
  if (!url) return true; // Allow empty URL
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const getPlatformInfo = (): PlatformType => {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux')) return 'linux';
  return 'default';
};

// Transient UI state uses the raw setter; only settings mutations enter persistence.
const createSettingsStore = (
  persistSettings: (settings: Settings) => unknown,
  get: () => SettingsStore,
  setTransient: StoreApi<SettingsStore>['setState']
): SettingsStore => {
  const updates = new SettingsUpdateController(
    () => get().settings,
    persistSettings,
    (error) => setTransient({ error })
  );
  return {
    settings: initialSettings,
    settingsOpen: false,
    error: null,
    openSettings: () => setTransient({ settingsOpen: true }),
    closeSettings: () => setTransient({ settingsOpen: false }),
    setError: (error) => setTransient({ error }),
    clearError: () => setTransient({ error: null }),
    updateApiSettings: async ({ apiKey, baseUrl, apiTimeout }) => {
      await updates.update((settings) => {
        if (baseUrl && !isValidUrl(baseUrl)) throw new Error('Invalid base URL format');
        return {
          ...settings,
          apiKey: apiKey ?? settings.apiKey,
          baseUrl: baseUrl || settings.baseUrl,
          apiTimeout: apiTimeout || settings.apiTimeout,
        };
      });
    },
    updateMarkdownPreferences: (preferences) => {
      void updates.update((settings) => ({
        ...settings,
        markdownPreferences: { ...settings.markdownPreferences, ...preferences },
      }));
    },
    updateEditorSettings: (editorSettings) => {
      void updates.update((settings) => ({
        ...settings,
        editorSettings: { ...settings.editorSettings, ...editorSettings },
      }));
    },
    updateShortcut: (key, value) => {
      void updates.update((settings) => {
        const currentShortcuts: Record<string, string> = { ...settings.shortcuts };
        delete currentShortcuts[key];
        ShortcutBinding.validateUpdate(value, currentShortcuts);
        return { ...settings, shortcuts: { ...settings.shortcuts, [key]: value } };
      });
    },
    updateLanguage: (language) => {
      void updates.update((settings) => ({ ...settings, language }));
    },
    resetSetting: (key) => {
      void updates.update((settings) => ({
        ...settings,
        [key]: structuredClone(initialSettings[key]),
      }));
    },
    batchUpdateSettings: (changes) => {
      void updates.update((settings) => ({ ...settings, ...changes }));
    },
    getPlatformShortcut: (shortcut) => {
      const platform = getPlatformInfo();
      const mapping = PLATFORM_KEY_MAPPING[platform] || PLATFORM_KEY_MAPPING.default;
      return shortcut.replace(/(Ctrl|Alt|Meta)/g, (match) => mapping[match] || match);
    },
  };
};

const settingsBackups = new SettingsBackupRepository(
  () => localStorage,
  STORAGE_KEYS.BACKUP,
  (error) => storeLog.error('Settings backup operation failed', { error })
);

const settingsPersistence = new SettingsPersistenceStorage({
  storage: () => localStorage,
  readBackup: (decode) => settingsBackups.restore(decode),
  writeBackup: (settings) => settingsBackups.create(settings),
  pruneBackups: () => settingsBackups.prune(),
  version: STORE_VERSION,
});

const storageConfig: PersistOptions<SettingsStore, PersistedState, Promise<void>> = {
  name: STORE_NAME,
  version: STORE_VERSION,
  partialize: (state): PersistedState => ({ settings: state.settings, timestamp: Date.now() }),
  storage: settingsPersistence,

  migrate: (persistedState: unknown, version: number): PersistedState => {
    assertSupportedSettingsVersion(version, STORE_VERSION);
    let migratedState = { ...readSettingsState(persistedState) };

    if (version === 0) {
      // Migration from initial version
      migratedState = {
        ...migratedState,
        settings: {
          ...initialSettings,
          ...migratedState.settings,
        },
      };
    }
    if (version === 0 || version === 1) {
      // Add new v2 fields with defaults
      if (migratedState.settings) {
        migratedState.settings = {
          ...migratedState.settings,
          apiTimeout: initialSettings.apiTimeout,
          theme: initialSettings.theme,
          markdownPreferences: {
            ...initialSettings.markdownPreferences,
            ...migratedState.settings.markdownPreferences,
          },
          editorSettings: {
            ...initialSettings.editorSettings,
            ...migratedState.settings.editorSettings,
          },
        };
      }
    }

    return readSettingsState(migratedState, false);
  },

  onRehydrateStorage: () => (_state, error) => {
    if (error) storeLog.error('Settings rehydration failed', { error });
  },
};

// Create and export store
const settingsInitializer: StateCreator<
  SettingsStore,
  [],
  [['zustand/persist', PersistedState]]
> = (set, get, api) =>
  persist<SettingsStore, [], [], PersistedState>(
    (persistedSet) => createSettingsStore((settings) => persistedSet({ settings }), get, set),
    storageConfig
  )(set, get, api);

const useSettingsStore = create<SettingsStore>()(settingsInitializer);

// Export custom hooks and selectors
export const useSettings = () => useSettingsStore((state) => state.settings);
export const useSettingsOpen = () => useSettingsStore((state) => state.settingsOpen);
export const useSettingsError = () => useSettingsStore((state) => state.error);

// Add new hooks for storage management
export const useStorageManager = () => ({
  checkStorage: storageManager.checkStorageSpace,
  cleanup: storageManager.cleanupStorage,
  createBackup: (settings: SettingsWithTimestamp) => settingsPersistence.createBackup(settings),
  restoreBackup: () => settingsPersistence.restoreBackup(),
  getStorageEstimate: storageManager.getStorageEstimate,
});

// Memoized platform shortcuts
export const usePlatformShortcuts = () => {
  const shortcuts = useSettingsStore((state) => state.settings.shortcuts);
  const getPlatformShortcut = useSettingsStore((state) => state.getPlatformShortcut);

  return useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(shortcuts)) {
      result[key] = getPlatformShortcut(value);
    }
    return result;
  }, [shortcuts, getPlatformShortcut]);
};

export default useSettingsStore;
