/** Browser module-load failures may remain cached until the document reloads. */
export class PreviewEngineLoadError extends Error {
  constructor(
    readonly engine: string,
    reason: unknown
  ) {
    super(reason instanceof Error ? reason.message : `${engine} could not be loaded.`);
    this.name = 'PreviewEngineLoadError';
  }
}
