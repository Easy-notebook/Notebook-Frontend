/**
 * FinishThinkingAction - Removes thinking indicator
 * Ported from: ref/Notebook-BCC/actions/thinking/finish_thinking_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class FinishThinkingAction extends ActionBase {
  execute(step: ExecutionStep): void {
    this.scriptStore.finishThinking();
    console.log('[FinishThinkingAction] Removed thinking indicator');
  }
}

registerAction('finish_thinking', FinishThinkingAction);
