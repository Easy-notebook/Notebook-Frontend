/**
 * UpdateTitleAction - Updates notebook title
 * Ported from: ref/Notebook-BCC/actions/workflow/update_title_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class UpdateTitleAction extends ActionBase {
  execute(step: ExecutionStep): void {
    // Accept title from either step.title or step.content (for compatibility with executeAction)
    const title = step.title || step.content;

    if (!title) {
      console.warn('[UpdateTitleAction] No title provided');
      return;
    }

    this.scriptStore.updateTitle(title);
    console.log(`[UpdateTitleAction] Updated title: ${title}`);
  }
}

registerAction('update_title', UpdateTitleAction);
