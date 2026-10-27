/** HTTP status remains available even when reading the error body fails. */
export class HttpResponseError extends Error {
  readonly name = 'HttpResponseError';

  constructor(
    readonly status: number,
    readonly statusText: string,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
  }
}
