/** A persisted preference changes names once; the runtime has one rich editor. */
export function migrateStoredEditorSettings(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('settings' in value)) return value;
  const settings = value.settings;
  if (!settings || typeof settings !== 'object' || !('editorSettings' in settings)) return value;
  const editor = settings.editorSettings;
  if (
    !editor ||
    typeof editor !== 'object' ||
    !('editorType' in editor) ||
    editor.editorType !== 'tiptap'
  )
    return value;
  return {
    ...value,
    settings: { ...settings, editorSettings: { ...editor, editorType: 'lexical' } },
  };
}
