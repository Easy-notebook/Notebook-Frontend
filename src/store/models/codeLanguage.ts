export const CODE_LANGUAGES = [
  { value: 'python', label: 'Python', executable: true },
  { value: 'javascript', label: 'JavaScript', executable: false },
  { value: 'typescript', label: 'TypeScript', executable: false },
] as const;

/** The notebook execution service currently exposes only a Python kernel. */
export function normalizeCodeLanguage(language?: string): string {
  const value = (language || 'python').toLowerCase();
  if (value === 'py') return 'python';
  if (value === 'js') return 'javascript';
  if (value === 'ts') return 'typescript';
  return value;
}

export function canExecuteCodeLanguage(language?: string): boolean {
  return (
    CODE_LANGUAGES.find((option) => option.value === normalizeCodeLanguage(language))?.executable ??
    false
  );
}
