/**
 * NewSectionAction - Creates level 2 heading (##)
 * Ported from: ref/Notebook-BCC/actions/content/new_section_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class NewSectionAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const content = `### ${step.content || ''}`;
    const metadata = { ...step.metadata, isSection: true };

    const cellId = this.scriptStore.addCell('text', content, metadata);
    console.log(`[NewSectionAction] Created section: ${cellId}`);
    return cellId;
  }
}

registerAction('new_section', NewSectionAction);
