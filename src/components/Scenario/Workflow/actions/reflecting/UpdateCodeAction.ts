/**
 * UpdateCodeAction - Updates code cell content AND metadata
 *
 * Handles the update_code action from /reflecting API response.
 * Updates the last code cell's content with fixed code,
 * and updates metadata to track the fix.
 *
 * Expected step format:
 * {
 *   action: 'update_code',
 *   content: '# 修复后的代码\nimport pandas as pd\n...',
 *   codecell_id?: 'optional_cell_id'  // defaults to last code cell
 * }
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';
import type { DebugMetadata } from './BugAnalysisAction';

export class UpdateCodeAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;
    const newCode = step.content || '';

    if (!newCode.trim()) {
      console.warn('[UpdateCodeAction] Empty code content');
      return null;
    }

    // Find target code cell
    let targetCell = null;

    if (step.codecell_id) {
      targetCell = cells.find((c) => c.id === step.codecell_id && c.type === 'code');
    } else {
      // Find last code cell
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i].type === 'code') {
          targetCell = cells[i];
          break;
        }
      }
    }

    if (!targetCell) {
      console.warn('[UpdateCodeAction] No code cell found to update');
      return null;
    }

    console.log(`[UpdateCodeAction] Updating cell: ${targetCell.id}`);

    // Get existing debug metadata (should have been set by bug_analysis)
    const existingDebug = (targetCell.metadata?.debug || {}) as Partial<DebugMetadata>;

    // Update metadata with fixed version
    const updatedDebug: DebugMetadata = {
      isDebugging: true,
      debugStartTime: existingDebug.debugStartTime || new Date().toISOString(),
      errorVersion: existingDebug.errorVersion || targetCell.content,
      bugAnalysis: existingDebug.bugAnalysis || '',
      fixedVersion: newCode,
    };

    // Update cell content AND metadata together
    notebookStore.updateCellObject(targetCell.id, {
      content: newCode,
      metadata: {
        ...targetCell.metadata,
        debug: updatedDebug,
      },
    });

    // Set as current cell
    notebookStore.setCurrentCell(targetCell.id);

    console.log(`[UpdateCodeAction] Cell ${targetCell.id} content and metadata updated`);
    console.log(`[UpdateCodeAction] Fixed code: ${newCode.substring(0, 50)}...`);

    return targetCell.id;
  }
}

registerAction('update_code', UpdateCodeAction);
