/** Malformed imported attributes remain literal text rather than aborting document loading. */
export function decodeTextAttribute(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
