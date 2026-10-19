import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { RepairedCodeExecution } from '../../store/RepairedCodeExecution';

export class ExecNewVersionAction extends ActionBase {
  execute(step: ExecutionStep, signal?: AbortSignal) {
    return new RepairedCodeExecution(signal).run(step.codecell_id);
  }
}

registerAction('exec_new_version', ExecNewVersionAction);
