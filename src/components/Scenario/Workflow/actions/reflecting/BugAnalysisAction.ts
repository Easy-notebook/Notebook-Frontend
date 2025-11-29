/**
 * BugAnalysisAction - Saves bug analysis to code cell metadata
 *
 * Handles the bug_analysis action from /reflecting API response.
 * Saves the analysis to the last code cell's metadata (no new cell created).
 *
 * Expected step format:
 * {
 *   action: 'bug_analysis',
 *   content: '在代码中的第3行出现了一个字符串未正确关闭的错误...'
 * }
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';

export interface DebugMetadata {
  isDebugging: boolean;
  debugStartTime: string;
  errorVersion: string;
  bugAnalysis: string;
  fixedVersion?: string;
  executedAfterFix?: boolean;
  executionSuccess?: boolean;
}

export class BugAnalysisAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;
    const analysisContent = step.content || '';

    if (!analysisContent.trim()) {
      console.warn('[BugAnalysisAction] Empty analysis content');
      return null;
    }

    // Find the last code cell
    let lastCodeCell = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].type === 'code') {
        lastCodeCell = cells[i];
        break;
      }
    }

    if (!lastCodeCell) {
      console.warn('[BugAnalysisAction] No code cell found');
      return null;
    }

    // Save bug analysis and error version to metadata
    const debugMetadata: DebugMetadata = {
      isDebugging: true,
      debugStartTime: new Date().toISOString(),
      errorVersion: lastCodeCell.content,
      bugAnalysis: analysisContent,
    };

    notebookStore.updateCellMetadata(lastCodeCell.id, {
      ...lastCodeCell.metadata,
      debug: debugMetadata,
    });

    // Set as current cell
    notebookStore.setCurrentCell(lastCodeCell.id);

    console.log(`[BugAnalysisAction] Saved bug analysis to cell ${lastCodeCell.id} metadata`);
    console.log(
      `[BugAnalysisAction] Error version saved: ${lastCodeCell.content.substring(0, 50)}...`
    );

    return lastCodeCell.id;
  }
}

registerAction('bug_analysis', BugAnalysisAction);
