/** Only executable cell subtypes can be restored from a standalone source fence. */
export function parseSourceCellType(value: unknown): 'code' | 'hybrid' | null {
  return value === 'code' || value === 'hybrid' ? value : null;
}
