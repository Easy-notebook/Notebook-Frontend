import {
  nativeView,
  nativeOperation,
  type NativeObservation,
  type NativeView,
  type PendingCommand,
} from './contracts';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';

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
  async command(command: PendingCommand, signal?: AbortSignal): Promise<void> {
    await this.transport.send('command', command, signal);
  }
}
