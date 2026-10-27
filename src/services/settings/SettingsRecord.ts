import type { PersistedState, Settings } from '@Store/models/settings';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const boolean = (value: unknown) => typeof value === 'boolean';
const string = (value: unknown) => typeof value === 'string';
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const oneOf =
  (...values: string[]) =>
  (value: unknown) =>
    values.includes(value as string);
type Rule = (value: unknown) => boolean;

function fields(value: unknown, rules: Record<string, Rule>, path: string, partial: boolean): void {
  if (!object(value)) throw new Error(`Invalid settings field: ${path}`);
  for (const [key, valid] of Object.entries(rules)) {
    if (partial && !Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (!valid(value[key])) throw new Error(`Invalid settings field: ${path}.${key}`);
  }
}

/** Validates stored data without coercion; only historical reads may omit fields. */
export function readSettingsRecord(value: unknown, partial = false): Settings {
  const nested =
    (rules: Record<string, Rule>, path: string): Rule =>
    (input) => {
      fields(input, rules, path, partial);
      return true;
    };
  fields(
    value,
    {
      apiKey: string,
      baseUrl: string,
      apiTimeout: finite,
      language: string,
      theme: oneOf('system', 'light', 'dark'),
      syncEnabled: boolean,
      lastSyncTime: (input) => input === null || string(input),
      markdownPreferences: nested(
        { autoFormat: boolean, syntaxHighlighting: boolean, lineNumbers: boolean },
        'settings.markdownPreferences'
      ),
      editorSettings: nested(
        {
          editorType: oneOf('tiptap', 'jupyter'),
          defaultLanguage: string,
          kernel: oneOf('local', 'remote', 'docker', 'cloud'),
          autoSave: boolean,
          autoComplete: boolean,
          autoFormat: boolean,
          showLineNumbers: boolean,
        },
        'settings.editorSettings'
      ),
      shortcuts: nested(
        {
          newCell: string,
          runCell: string,
          deleteCell: string,
          formatCode: string,
          saveFile: string,
        },
        'settings.shortcuts'
      ),
    },
    'settings',
    partial
  );
  return value as Settings;
}

export function readSettingsState(value: unknown, partial = true): PersistedState {
  if (!object(value) || !object(value.settings) || typeof value.settings.apiKey !== 'string')
    throw new Error('Invalid persisted settings payload');
  readSettingsRecord(value.settings, partial);
  if (value.timestamp !== undefined && !finite(value.timestamp))
    throw new Error('Invalid settings field: timestamp');
  return value as unknown as PersistedState;
}
