// src/store/models/settings.ts

export type ThemeType = 'system' | 'light' | 'dark';

export type PlatformType = 'macos' | 'windows' | 'linux' | 'default';

export interface MarkdownPreferences {
  autoFormat: boolean;
  syntaxHighlighting: boolean;
  lineNumbers: boolean;
}

export interface EditorSettings {
  editorType: 'tiptap' | 'jupyter';
  defaultLanguage: string;
  kernel: 'local' | 'remote' | 'docker' | 'cloud';
  autoSave: boolean;
  autoComplete: boolean;
  autoFormat: boolean;
  showLineNumbers: boolean;
}

export interface Shortcuts {
  newCell: string;
  runCell: string;
  deleteCell: string;
  formatCode: string;
  saveFile: string;
}

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

export interface SettingsWithTimestamp extends Settings {
  timestamp?: number;
}

export interface StorageItem {
  key: string;
  size: number;
  timestamp: number;
  importance: number;
}

export interface StorageEstimate {
  quota?: number;
  usage?: number;
}

export interface PlatformKeyMapping {
  [key: string]: string;
}

export interface PlatformKeyMappingConfig {
  [platform: string]: PlatformKeyMapping;
}

export interface PersistedState {
  settings?: Settings;
  timestamp?: number;
}
