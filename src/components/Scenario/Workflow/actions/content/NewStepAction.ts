/**
 * NewStepAction - Creates level 3 heading (###)
 * Ported from: ref/Notebook-BCC/actions/content/new_step_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class NewStepAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const content = `### ${step.content || ''}`;
    const metadata = { ...step.metadata, isStep: true };

    const cellId = this.scriptStore.addCell('text', content, metadata);
    console.log(`[NewStepAction] Created step: ${cellId}`);
    return cellId;
  }
}

registerAction('new_step', NewStepAction);
