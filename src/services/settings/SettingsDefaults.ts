import type { Settings } from '@Store/models/settings';

export const initialSettings: Settings = {
  apiKey: '',
  baseUrl: 'https://api.example.com',
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
