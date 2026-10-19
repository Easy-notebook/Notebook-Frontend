import type { AnalysisResult, PreStageState } from '@Store/models';

type SelectionState =
  | { status: 'idle' }
  | { status: 'analyzing'; file: File }
  | { status: 'ready'; file: File }
  | { status: 'failed'; file: File };
type AnalysisProjection = Pick<
  PreStageState,
  'currentFile' | 'isUploading' | 'file_columns' | 'datasetInfo'
>;

/** Latest file selection owns publication, independently of UI loading flags. */
export class DatasetAnalysisSession {
  private state: SelectionState = { status: 'idle' };
  constructor(
    private readonly analyze: (file: File) => Promise<AnalysisResult | null>,
    private readonly publish: (state: AnalysisProjection) => void,
    private readonly reportError: (error: unknown) => void
  ) {}

  invalidate(): void {
    this.state = { status: 'idle' };
  }

  async select(file: File | null): Promise<void> {
    const request: SelectionState = file ? { status: 'analyzing', file } : { status: 'idle' };
    this.state = request;
    this.publish({
      currentFile: file,
      isUploading: file !== null,
      file_columns: [],
      datasetInfo: '',
    });
    if (!file || this.state !== request) return;
    try {
      const result = await this.analyze(file);
      if (this.state !== request) return;
      if (!result) throw new Error('Failed to analyze dataset structure');
      const { columns, metadata } = result;
      const datasetInfo =
        `Dataset contains ${metadata.rowCount} rows and ${metadata.columnCount} columns. ` +
        `Numeric columns (${metadata.numericColumns.length}): ${metadata.numericColumns.join(', ') || 'none'}. ` +
        `Categorical columns (${metadata.categoricalColumns.length}): ${metadata.categoricalColumns.join(', ') || 'none'}. ` +
        `Date columns (${metadata.dateColumns.length}): ${metadata.dateColumns.join(', ') || 'none'}.`;
      this.state = { status: 'ready', file };
      this.publish({ currentFile: file, isUploading: false, file_columns: columns, datasetInfo });
    } catch (error) {
      if (this.state !== request) return;
      this.state = { status: 'failed', file };
      this.publish({ currentFile: file, isUploading: false, file_columns: [], datasetInfo: '' });
      this.reportError(error);
    }
  }
}
