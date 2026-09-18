/**
 * BugAnalysisAction - Handles bug analysis from AI
 * Stream Action Type: bug_analysis
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useNotebookStore from '@Store/notebookStore';

export class BugAnalysisAction extends StreamAction {
  static actionType = 'bug_analysis';

  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;
    const p = payload as any;
    const content = p.content || p.analysis || '';

    console.log('[BugAnalysisAction] Processing bug analysis:', content);

    // Find the last code cell (usually the one being debugged)
    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;
    let targetCell = null;

    if (payload.cellId || (payload as any).codecell_id) {
      targetCell = cells.find((c) => c.id === (payload.cellId || (payload as any).codecell_id));
    } else {
      // Find last code cell
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i].type === 'code') {
          targetCell = cells[i];
          break;
        }
      }
    }

    if (targetCell) {
      // Update metadata using updateCellObject for better reliability
      const existingDebug = targetCell.metadata?.debug || {};
      const newMetadata = {
        ...targetCell.metadata,
        debug: {
          ...existingDebug,
          isDebugging: true,
          bugAnalysis: content,
          debugStartTime: existingDebug.debugStartTime || new Date().toISOString(),
        },
      };

      notebookStore.updateCellObject(targetCell.id, {
        metadata: newMetadata,
      });

      console.log(`[BugAnalysisAction] Updated metadata for cell ${targetCell.id}`);
    } else {
      console.warn('[BugAnalysisAction] No target cell found');
    }
  }
}

registerStreamAction(BugAnalysisAction.actionType, BugAnalysisAction);
