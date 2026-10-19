/** Error reporting must not fail when JavaScript throws a non-Error value. */
export function describeError(error: unknown): string {
  try {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    )
      return error.message || 'Unknown error';
    return error == null ? 'Unknown error' : String(error);
  } catch {
    return 'Unknown error';
  }
}
