/**
 * UpdateLastTextAction - Updates last text cell content
 * Ported from: ref/Notebook-BCC/actions/workflow/update_last_text_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class UpdateLastTextAction extends ActionBase {
  execute(step: ExecutionStep): void {
    if (!step.text) {
      console.warn('[UpdateLastTextAction] No text provided');
      return;
    }

    this.scriptStore.updateLastText(step.text);
    console.log(`[UpdateLastTextAction] Updated last text`);
  }
}

registerAction('update_last_text', UpdateLastTextAction);
