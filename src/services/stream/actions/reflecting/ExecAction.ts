/**
 * ExecAction - Alias for ExecNewVersionAction to support "exec" type
 * Stream Action Type: exec
 */

import { registerStreamAction } from '../base';
import { ExecNewVersionAction } from './ExecNewVersionAction';

export class ExecAction extends ExecNewVersionAction {
  static actionType = 'exec';
}

registerStreamAction(ExecAction.actionType, ExecAction);
