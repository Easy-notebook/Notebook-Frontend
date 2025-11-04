// store/settingsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { encrypt, decrypt } from '../utils/encryption';
import { useMemo } from 'react';

// Constants
const STORE_NAME = 'easy-notebook-settings';
const STORE_VERSION = 2;
const STORAGE_KEYS = {
    SETTINGS: 'easy-notebook-settings',
    BACKUP: 'easy-notebook-settings-backup'
} as const;
const TEST_STORAGE_KEY = '!!testQuota';
const MIN_STORAGE_SPACE = 1024 * 50; // 50KB minimum storage requirement
const MAX_SHORTCUT_KEYS = 3; // Maximum number of keys in a shortcut combination
const CLEANUP_THRESHOLD = 1024 * 1024; // 1MB
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_API_URL = 'https://api.example.com';

/**
 * 主题类型
 */
export type ThemeType = 'system' | 'light' | 'dark';

/**
 * 平台类型
 */
export type PlatformType = 'macos' | 'windows' | 'linux' | 'default';

/**
 * Markdown 偏好设置接口
 */
export interface MarkdownPreferences {
    autoFormat: boolean;
    syntaxHighlighting: boolean;
    lineNumbers: boolean;
}

/**
 * 编辑器设置接口
 */
export interface EditorSettings {
    editorType: 'tiptap' | 'jupyter';
    defaultLanguage: string;
    kernel: 'local' | 'remote' | 'docker' | 'cloud';
    autoSave: boolean;
    autoComplete: boolean;
    autoFormat: boolean;
    showLineNumbers: boolean;
}

/**
 * 快捷键设置接口
 */
export interface Shortcuts {
    newCell: string;
    runCell: string;
    deleteCell: string;
    formatCode: string;
    saveFile: string;
}

/**
 * 设置接口
 */
export interface Settings {
    apiKey: string;
    baseUrl: string;
    apiTimeout: number;
    markdownPreferences: MarkdownPreferences;
    editorSettings: EditorSettings;
    shortcuts: Shortcuts;
    theme: ThemeType;
    language: string;
    syncEnabled: boolean;
    lastSyncTime: string | null;
}

/**
 * 带时间戳的设置接口
 */
export interface SettingsWithTimestamp extends Settings {
    timestamp?: number;
}

/**
 * 存储项接口
 */
export interface StorageItem {
    key: string;
    size: number;
    timestamp: number;
    importance: number;
}

/**
 * 存储估算接口
 */
export interface StorageEstimate {
    quota?: number;
    usage?: number;
}

/**
 * 平台键映射接口
 */
export interface PlatformKeyMapping {
    [key: string]: string;
}

/**
 * 平台键映射配置
 */
export interface PlatformKeyMappingConfig {
    [platform: string]: PlatformKeyMapping;
}

/**
 * 持久化状态接口
 */
export interface PersistedState {
    settings?: Settings;
    timestamp?: number;
}

/**
 * Settings Store 状态接口
 */
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

// System reserved shortcuts to avoid conflicts
const RESERVED_SHORTCUTS = new Set([
    'Ctrl+C',
    'Ctrl+V',
    'Ctrl+X',
    'Ctrl+A',
    'Ctrl+Z',
]);

// Initial settings with default values
const initialSettings: Settings = {
    apiKey: '',
    baseUrl: DEFAULT_API_URL,
    apiTimeout: 30000,
    markdownPreferences: {
        autoFormat: true,
        syntaxHighlighting: true,
        lineNumbers: false,
    },
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
};

// Storage management utilities
const storageManager = {
    async getStorageEstimate(): Promise<StorageEstimate | null> {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            return await navigator.storage.estimate();
        }
        return null;
    },

    async checkStorageSpace(): Promise<boolean> {
        try {
            const estimate = await this.getStorageEstimate();
            if (estimate && estimate.quota && estimate.usage) {
                return (estimate.quota - estimate.usage) > MIN_STORAGE_SPACE;
            }

            // Fallback: Use a small test string
            const testData = 'x'.repeat(1024);
            localStorage.setItem(TEST_STORAGE_KEY, testData);
            localStorage.removeItem(TEST_STORAGE_KEY);
            return true;
        } catch (e) {
            console.error('Storage space check failed:', e);
            return false;
        }
    },

    async clearOldBackups(): Promise<void> {
        const keys = Object.keys(localStorage);
        const backupPattern = new RegExp(`${STORAGE_KEYS.BACKUP}-(\\d+)$`);
        const backups = keys.filter(key => backupPattern.test(key))
            .sort((a, b) => {
                const timeA = parseInt(a.split('-').pop() || '0') || 0;
                const timeB = parseInt(b.split('-').pop() || '0') || 0;
                return timeB - timeA;
            });

        // Keep only the 2 most recent backups
        for (let i = 2; i < backups.length; i++) {
            localStorage.removeItem(backups[i]);
        }
    },

    async createBackup(data: SettingsWithTimestamp): Promise<void> {
        try {
            const timestamp = Date.now();
            const backupKey = `${STORAGE_KEYS.BACKUP}-${timestamp}`;
            const compressed = JSON.stringify(data);
            localStorage.setItem(backupKey, compressed);
            await this.clearOldBackups();
        } catch (error) {
            console.error('Backup creation failed:', error);
        }
    },

    async restoreFromBackup(): Promise<PersistedState | null> {
        const keys = Object.keys(localStorage);
        const backupPattern = new RegExp(`${STORAGE_KEYS.BACKUP}-(\\d+)$`);
        const latestBackup = keys.filter(key => backupPattern.test(key))
            .sort((a, b) => {
                const timeA = parseInt(a.split('-').pop() || '0') || 0;
                const timeB = parseInt(b.split('-').pop() || '0') || 0;
                return timeB - timeA;
            })[0];

        if (latestBackup) {
            try {
                const compressed = localStorage.getItem(latestBackup);
                if (compressed) {
                    const data = JSON.parse(compressed);
                    return data;
                }
            } catch (error) {
                console.error('Backup restoration failed:', error);
                return null;
            }
        }
        return null;
    },

    async cleanupStorage(): Promise<boolean> {
        try {
            const keys = Object.keys(localStorage);
            const oldSettingsPattern = /^easy-notebook-(?!settings)/;
    
            // Get total size and sort by importance and age
            const items: StorageItem[] = keys
                .filter(key => oldSettingsPattern.test(key))
                .map(key => {
                    const value = localStorage.getItem(key) || '';
                    let parsed: any = {};
                    try {
                        parsed = JSON.parse(value);
                    } catch {
                        // ignore parsing errors
                    }
                    return {
                        key,
                        size: value.length,
                        timestamp: parsed?.timestamp || 0,
                        importance: parsed?.importance || 0,
                    };
                });
    
            // Sort by importance (ascending) and age (oldest first)
            items.sort((a, b) => {
                if (a.importance !== b.importance) {
                    return a.importance - b.importance;
                }
                return a.timestamp - b.timestamp;
            });
    
            // Remove items until we free up enough space
            let freedSpace = 0;
            for (const item of items) {
                localStorage.removeItem(item.key);
                freedSpace += item.size;
                if (freedSpace >= CLEANUP_THRESHOLD) break;
            }
    
            return true;
        } catch (e) {
            console.error('Storage cleanup failed:', e);
            return false;
        }
    }
};

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

const validateShortcut = (shortcut: string, existingShortcuts: Shortcuts): boolean => {
    const keyPattern = /^(Ctrl|Alt|Shift|Meta)$/;
    const finalKeyPattern = /^[A-Za-z0-9]$/;
    const parts = shortcut.split('+').map(p => p.trim());

    if (parts.length > MAX_SHORTCUT_KEYS || parts.length < 2) {
        throw new Error(`Shortcut must have 2-${MAX_SHORTCUT_KEYS} keys`);
    }

    const modifiers = parts.slice(0, -1);
    const finalKey = parts[parts.length - 1];

    if (!modifiers.every(mod => keyPattern.test(mod))) {
        throw new Error('Invalid modifier key(s)');
    }

    if (!finalKeyPattern.test(finalKey)) {
        throw new Error('Invalid final key');
    }

    const normalizedShortcut = shortcut.toLowerCase().replace(/\s+/g, '');
    if (RESERVED_SHORTCUTS.has(normalizedShortcut)) {
        throw new Error('This shortcut is reserved by the system');
    }

    const conflicts = Object.entries(existingShortcuts)
        .filter(([_, value]) => value.toLowerCase().replace(/\s+/g, '') === normalizedShortcut);

    if (conflicts.length > 0) {
        throw new Error(`Shortcut conflicts with: ${conflicts.map(([key]) => key).join(', ')}`);
    }

    return true;
};

const getPlatformInfo = (): PlatformType => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('win')) return 'windows';
    if (platform.includes('linux')) return 'linux';
    return 'default';
};

const withRetry = async <T>(operation: () => Promise<T>, maxAttempts = MAX_RETRY_ATTEMPTS): Promise<T> => {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            if (attempt === maxAttempts) break;

            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Try cleanup if storage is full
            if (error.name === 'QuotaExceededError') {
                await storageManager.cleanupStorage();
            }
        }
    }

    throw lastError!;
};

// Create Settings Store
const createSettingsStore = (set: any, get: any): SettingsStore => ({
    settings: initialSettings,
    settingsOpen: false,
    error: null,

    // Panel Controls
    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),

    // Error Handling
    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),

    // API Settings
    updateApiSettings: async ({ apiKey, baseUrl, apiTimeout }: {
        apiKey?: string;
        baseUrl?: string;
        apiTimeout?: number;
    }) => {
        try {
            if (baseUrl && !isValidUrl(baseUrl)) {
                throw new Error('Invalid base URL format');
            }

            const encryptedKey = apiKey ? await encrypt(apiKey) : get().settings.apiKey;

            set((state: SettingsStoreState) => ({
                settings: {
                    ...state.settings,
                    apiKey: encryptedKey,
                    baseUrl: baseUrl || state.settings.baseUrl,
                    apiTimeout: apiTimeout || state.settings.apiTimeout,
                },
                error: null,
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Markdown Preferences
    updateMarkdownPreferences: (preferences: Partial<MarkdownPreferences>) => {
        try {
            set((state: SettingsStoreState) => ({
                settings: {
                    ...state.settings,
                    markdownPreferences: {
                        ...state.settings.markdownPreferences,
                        ...preferences,
                    }
                },
                error: null,
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Editor Settings
    updateEditorSettings: (editorSettings: Partial<EditorSettings>) => {
        try {
            set((state: SettingsStoreState) => ({
                settings: {
                    ...state.settings,
                    editorSettings: {
                        ...state.settings.editorSettings,
                        ...editorSettings,
                    }
                },
                error: null,
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Shortcuts
    updateShortcut: (key: string, value: string) => {
        try {
            set((state: SettingsStoreState) => {
                const currentShortcuts = { ...state.settings.shortcuts };
                delete (currentShortcuts as any)[key];

                if (validateShortcut(value, currentShortcuts)) {
                    return {
                        settings: {
                            ...state.settings,
                            shortcuts: {
                                ...state.settings.shortcuts,
                                [key]: value,
                            }
                        },
                        error: null,
                    };
                }
                return state;
            });
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Language
    updateLanguage: (language: string) => {
        try {
            set((state: SettingsStoreState) => ({
                settings: {
                    ...state.settings,
                    language,
                },
                error: null,
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Reset Settings
    resetSetting: (key: keyof Settings) => {
        try {
            set((state: SettingsStoreState) => ({
                settings: {
                    ...state.settings,
                    [key]: (initialSettings as any)[key],
                },
                error: null,
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Batch Update
    batchUpdateSettings: (updates: Partial<Settings>) => {
        try {
            set((state: SettingsStoreState) => ({
                settings: {
                    ...state.settings,
                    ...updates,
                },
                error: null,
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        }
    },

    // Platform-specific shortcuts
    getPlatformShortcut: (shortcut: string): string => {
        const platform = getPlatformInfo();
        const mapping = PLATFORM_KEY_MAPPING[platform] || PLATFORM_KEY_MAPPING.default;
        return shortcut.replace(/(Ctrl|Alt|Meta)/g, match => mapping[match] || match);
    },
});

// Storage Configuration
const storageConfig = {
    name: STORE_NAME,
    version: STORE_VERSION,

    partialize: (state: SettingsStoreState): PersistedState => ({
        settings: {
            ...state.settings,
            timestamp: Date.now(),
        }
    }),

    storage: {
        getItem: async (name: string): Promise<PersistedState | null> => {
            try {
                const value = localStorage.getItem(name);
                if (!value) {
                    // Try to restore from backup if main storage is empty
                    return await storageManager.restoreFromBackup();
                }

                const decompressed = value;
                const parsed = JSON.parse(decompressed);

                if (parsed.settings?.apiKey) {
                    parsed.settings.apiKey = await decrypt(parsed.settings.apiKey);
                }

                return parsed;
            } catch (error) {
                console.error('Error reading settings:', error);
                // Attempt to restore from backup on error
                return await storageManager.restoreFromBackup();
            }
        },

        setItem: async (name: string, value: PersistedState): Promise<void> => {
            return await withRetry(async () => {
                try {
                    // Create backup before attempting to save
                    await storageManager.createBackup(value.settings as SettingsWithTimestamp);

                    // Check storage space and cleanup if necessary
                    if (!await storageManager.checkStorageSpace()) {
                        await storageManager.cleanupStorage();
                    }

                    // Compress with UTF16 for better compression ratio
                    const compressed = JSON.stringify(value);
                    localStorage.setItem(name, compressed);
                } catch (error: any) {
                    // If setting fails, try clearing some space and retry
                    if (error.name === 'QuotaExceededError') {
                        await storageManager.clearOldBackups();
                        // Compress and retry
                        const compressed = JSON.stringify(value);
                        localStorage.setItem(name, compressed);
                    } else {
                        throw error;
                    }
                }
            });
        },

        removeItem: async (name: string): Promise<void> => {
            try {
                localStorage.removeItem(name);
            } catch (error) {
                console.error('Error removing settings:', error);
            }
        }
    },

    migrate: (persistedState: PersistedState, version: number): PersistedState => {
        let migratedState = { ...persistedState };

        try {
            switch (version) {
                case 0:
                    // Migration from initial version
                    migratedState = {
                        ...migratedState,
                        settings: {
                            ...initialSettings,
                            ...migratedState.settings,
                        }
                    };
                /* falls through */
                case 1:
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
                            }
                        };
                    }
                    break;
                default:
                    if (version > STORE_VERSION) {
                        console.warn('Future version detected, resetting to initial state');
                        return { settings: initialSettings };
                    }
            }

            return migratedState;
        } catch (error) {
            console.error('Migration failed:', error);
            return { settings: initialSettings };
        }
    },

    // Add onRehydrateStorage handler
    onRehydrateStorage: () => (state: SettingsStoreState | null) => {
        if (!state) {
            console.warn('Storage rehydration failed, attempting backup restore');
            return storageManager.restoreFromBackup();
        }
    }
};

// Create and export store
const useSettingsStore = create<SettingsStore>()(persist(createSettingsStore, storageConfig));

// Export custom hooks and selectors
export const useSettings = () => useSettingsStore((state) => state.settings);
export const useSettingsOpen = () => useSettingsStore((state) => state.settingsOpen);
export const useSettingsError = () => useSettingsStore((state) => state.error);

// Add new hooks for storage management
export const useStorageManager = () => ({
    checkStorage: storageManager.checkStorageSpace,
    cleanup: storageManager.cleanupStorage,
    createBackup: storageManager.createBackup,
    restoreBackup: storageManager.restoreFromBackup,
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