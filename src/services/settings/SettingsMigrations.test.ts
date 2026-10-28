import { it, expect } from 'vitest';
import { migrateStoredEditorSettings } from './SettingsMigrations';
it('migrates only the old editor preference and retains all other persisted settings', () => {
  const state = {
    settings: {
      apiKey: 'encrypted',
      editorSettings: { editorType: 'tiptap', autoSave: false },
      theme: 'dark',
    },
    timestamp: 17,
  };
  const result = migrateStoredEditorSettings(state);
  expect(result).toEqual({
    ...state,
    settings: { ...state.settings, editorSettings: { editorType: 'lexical', autoSave: false } },
  });
  expect(state.settings.editorSettings.editorType).toBe('tiptap');
});
it('leaves current settings, other editors and malformed data to the normal validator', () => {
  for (const value of [
    null,
    { settings: { editorSettings: { editorType: 'lexical' } } },
    { settings: { editorSettings: { editorType: 'jupyter' } } },
    { settings: { editorSettings: { editorType: 'unknown' } } },
  ])
    expect(migrateStoredEditorSettings(value)).toBe(value);
});
