/**
 * CommentResultAction - Adds content and moves effects to history
 * Ported from: ref/Notebook-BCC/actions/content/comment_result_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class CommentResultAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    if (!step.content) {
      console.warn('[CommentResultAction] No content provided');
      return null;
    }

    const cellId = this.scriptStore.addNewContent2EndCellMarkdown(step.content);
    return cellId;
  }
}

registerAction('comment-result', CommentResultAction);
