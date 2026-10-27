export interface TabDiscoveryFailure {
  readonly source: 'cache' | 'backend';
  readonly cause: unknown;
}

/** Discovery could not produce a usable catalog or confirm that it was empty. */
export class TabDiscoveryError extends Error {
  readonly name = 'TabDiscoveryError';
  readonly failures: readonly TabDiscoveryFailure[];

  constructor(failures: readonly TabDiscoveryFailure[]) {
    super('Unable to discover notebook files');
    this.failures = Object.freeze(failures.map((failure) => Object.freeze({ ...failure })));
  }
}
