/**
 * NewChapterAction - Creates level 1 heading (#)
 * Ported from: ref/Notebook-BCC/actions/content/new_chapter_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';

export class NewChapterAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const content = `## ${step.content || ''}`;
    const metadata = { ...step.metadata, isChapter: true };

    const cellId = this.scriptStore.addCell('text', content, metadata);
    console.log(`[NewChapterAction] Created chapter: ${cellId}`);
    return cellId;
  }
}

registerAction('new_chapter', NewChapterAction);
