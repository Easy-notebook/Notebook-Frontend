import { expect, it } from 'vitest';
import { initialSettings } from './SettingsDefaults';
import { readSettingsRecord, readSettingsState } from './SettingsRecord';

it('accepts valid complete settings without coercion or loss of extension fields', () => {
  const settings = { ...initialSettings, extension: 'keep' };
  expect(readSettingsRecord(settings)).toBe(settings);
});

it.each([
  ['language', 42],
  ['apiTimeout', Infinity],
  ['theme', 'unknown'],
  ['syncEnabled', 'false'],
  ['lastSyncTime', 0],
  ['shortcuts', []],
  ['markdownPreferences', { ...initialSettings.markdownPreferences, autoFormat: 'true' }],
  ['editorSettings', { ...initialSettings.editorSettings, kernel: 'unsupported' }],
])('rejects invalid %s in complete and historical records', (field, value) => {
  const settings = { ...initialSettings, [field]: value };
  expect(() => readSettingsRecord(settings)).toThrow(`settings.${field}`);
  expect(() => readSettingsRecord(settings, true)).toThrow(`settings.${field}`);
});

it('permits missing historical fields while requiring complete current settings', () => {
  const state = { settings: { apiKey: '', markdownPreferences: { autoFormat: true } } };
  expect(readSettingsState(state)).toBe(state);
  expect(() => readSettingsState(state, false)).toThrow('settings.baseUrl');
});

it('rejects invalid payload timestamps without including values in errors', () => {
  expect(() => readSettingsState({ settings: initialSettings, timestamp: 'sensitive' })).toThrow(
    'Invalid settings field: timestamp'
  );
});
