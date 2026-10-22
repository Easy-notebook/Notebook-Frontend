import { studyFigure, type FigureQuery, type StudyFigureSnapshot } from './studyFigure';
import {
  nativeView,
  nativeOperation,
  nativeCommandLookup,
  type NativeObservation,
  type NativeView,
  type PendingCommand,
} from './contracts';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import {
  studyKnowledge,
  studyKnowledgeReport,
  type StudyKnowledge,
  type StudyKnowledgeReport,
} from './studyKnowledge';

/** Same-origin transport; native notebook identity is checked independently of the URL. */
export class NativeStudyClient {
  private readonly transport: NativeNotebookTransport;
  constructor(
    readonly notebookId: string,
    request: typeof fetch = (...args) => fetch(...args)
  ) {
    this.transport = new NativeNotebookTransport(notebookId, request);
  }
  async state(signal?: AbortSignal): Promise<NativeView> {
    const view = nativeView.parse(await this.transport.send('state', undefined, signal));
    if (view.frontend_notebook_id !== this.notebookId)
      throw new Error('Native notebook identity mismatch');
    return view;
  }
  async operation(
    command: PendingCommand,
    signal?: AbortSignal
  ): Promise<NativeObservation | null> {
    const value = nativeOperation.parse(
      await this.transport.send(
        `operations/${encodeURIComponent(command.invocation)}`,
        undefined,
        signal
      )
    );
    if (
      value.frontend_notebook_id !== this.notebookId ||
      value.invocation !== command.invocation ||
      (value.observation &&
        (value.observation.workspace !== command.workspace ||
          value.observation.ability !== command.ability))
    )
      throw new Error('Native operation identity mismatch');
    return value.observation;
  }
  async knowledge(
    workspace: string,
    revision: number,
    signal?: AbortSignal
  ): Promise<StudyKnowledge> {
    const value = studyKnowledge.parse(await this.transport.send('knowledge', undefined, signal));
    this.checkKnowledgeOwner(value, workspace, revision);
    return value;
  }
  async knowledgeReport(
    workspace: string,
    revision: number,
    signal?: AbortSignal
  ): Promise<StudyKnowledgeReport> {
    const value = studyKnowledgeReport.parse(
      await this.transport.send('knowledge-report', undefined, signal)
    );
    this.checkKnowledgeOwner(value, workspace, revision);
    return value;
  }
  private checkKnowledgeOwner(
    value: Pick<StudyKnowledge, 'frontend_notebook_id' | 'workspace' | 'revision'>,
    workspace: string,
    revision: number
  ): void {
    if (value.frontend_notebook_id !== this.notebookId || value.workspace !== workspace)
      throw new Error('研究知识所属笔记不一致，请刷新研究');
    if (value.revision !== revision) throw new Error('研究已发生变化，请刷新研究后重新读取知识');
  }
  async figure(query: FigureQuery, signal?: AbortSignal): Promise<StudyFigureSnapshot> {
    const value = studyFigure.parse(await this.transport.send('figure', query, signal));
    if (
      value.frontend_notebook_id !== this.notebookId ||
      value.workspace !== query.workspace ||
      value.revision !== query.expected_revision ||
      value.figure.reference_id !== query.expected_reference_id ||
      value.figure.x_feature !== query.x_feature ||
      value.figure.y_feature !== query.y_feature
    )
      throw new Error('图表不属于当前笔记、修订或所选参考，请刷新研究');
    return value;
  }
  async completed(command: PendingCommand, signal?: AbortSignal): Promise<boolean> {
    const value = nativeCommandLookup.parse(
      await this.transport.send('commands/lookup', command, signal)
    );
    if (
      value.frontend_notebook_id !== this.notebookId ||
      value.workspace !== command.workspace ||
      value.invocation !== command.invocation ||
      value.ability !== command.ability ||
      (value.status === 'completed' && value.result.id !== command.workspace)
    )
      throw new Error('Native command completion identity mismatch');
    return value.status === 'completed';
  }
  async command(command: PendingCommand, signal?: AbortSignal): Promise<void> {
    await this.transport.send('command', command, signal);
  }
}
