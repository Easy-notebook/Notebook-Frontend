/**
 * CommentResultAction - Adds content and moves effects to history
 * Ported from: ref/Notebook-BCC/actions/content/comment_result_action.py
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';

export class CommentResultAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    if (!step.content) {
      console.warn('[CommentResultAction] No content provided');
      return null;
    }
    // remove ‘\n' for ' '
    step.content = step.content.replace(/\n/g, ' ');
    const cellId = this.scriptStore.addNewContent2EndCellMarkdown(step.content);
    return cellId;
  }
}

registerAction('comment-result', CommentResultAction);
