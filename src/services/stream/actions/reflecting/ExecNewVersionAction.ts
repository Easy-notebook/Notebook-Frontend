import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import { RepairedCodeExecution } from '@WorkflowMode/store/RepairedCodeExecution';

export class ExecNewVersionAction extends StreamAction {
  static actionType = 'exec_new_version';

  async execute(context: StreamActionContext): Promise<void> {
    const payload = context.payload as typeof context.payload & { codecell_id?: string };
    await new RepairedCodeExecution(context.signal).run(
      payload.cellId || payload.codecell_id,
      context.notebookId
    );
  }
}

registerStreamAction(ExecNewVersionAction.actionType, ExecNewVersionAction);
