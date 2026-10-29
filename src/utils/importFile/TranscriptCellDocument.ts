import type { Cell } from '@Store/models';

/** View over typed import data; authored content and tool outputs remain independent. */
export class TranscriptCellDocument {
  static read(cell: Cell): TranscriptCellDocument | null {
    return cell.metadata?.transcriptFormat === 2 ? new TranscriptCellDocument(cell) : null;
  }
  private constructor(readonly cell: Cell) {}
  get activity(): boolean {
    return this.role === 'tool' || this.role === 'system';
  }
  get richMarkdown(): boolean {
    return this.cell.type === 'markdown' && ['prose', 'table'].includes(this.kind);
  }
  get text(): string {
    return this.cell.content;
  }
  get role(): string {
    return this.cell.metadata?.transcriptRole ?? 'system';
  }
  get kind(): string {
    return this.cell.metadata?.transcriptKind ?? 'prose';
  }
  get turn(): number {
    return this.cell.metadata?.turnIndex ?? 0;
  }
  get heading(): string | null {
    return this.role === 'user' && this.cell.metadata?.messageStart
      ? this.text.split('\n')[0].replace(/^#{1,6}\s+/, '')
      : null;
  }
  get issues(): string[] {
    return this.cell.metadata?.issues ?? [];
  }
}
