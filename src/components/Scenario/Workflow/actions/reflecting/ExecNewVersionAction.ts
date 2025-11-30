/**
 * ExecNewVersionAction - Executes the fixed code cell
 *
 * Handles the exec_new_version action from /reflecting API response.
 * Executes the last code cell (which should have been updated by update_code).
 * Updates metadata with execution result.
 *
 * Expected step format:
 * {
 *   action: 'exec_new_version',
 *   codecell_id?: 'optional_cell_id'  // defaults to last code cell
 * }
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';
import type { DebugMetadata } from './BugAnalysisAction';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { WorkflowState } from '../../observation/WorkflowState';
import { ClearEffectCurrentAction } from './ClearEffectCurrent';

export class ExecNewVersionAction extends ActionBase {
  async execute(step: ExecutionStep): Promise<any> {
    // Clear current effects before execution
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const workflowState = new WorkflowState(stateJSON);

    ClearEffectCurrentAction.processState(workflowState);

    stateMachine.setState(workflowState.toJSON());

    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;

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
      console.warn('[ExecNewVersionAction] No code cell found to execute');
      return { success: false, error: 'No code cell found' };
    }

    console.log(`[ExecNewVersionAction] Executing fixed cell: ${targetCell.id}`);

    try {
      // Execute the code cell using scriptStore
      const result = await this.scriptStore.execCodeCell(targetCell.id, true, false);

      // Get existing debug metadata
      const existingDebug = (targetCell.metadata?.debug || {}) as Partial<DebugMetadata>;

      // Update metadata with execution result
      const updatedDebug: DebugMetadata = {
        isDebugging: existingDebug.isDebugging ?? true,
        debugStartTime: existingDebug.debugStartTime || new Date().toISOString(),
        errorVersion: existingDebug.errorVersion || '',
        bugAnalysis: existingDebug.bugAnalysis || '',
        fixedVersion: existingDebug.fixedVersion,
        executedAfterFix: true,
        executionSuccess: result?.success ?? true,
      };

      notebookStore.updateCellMetadata(targetCell.id, {
        ...targetCell.metadata,
        debug: updatedDebug,
      });

      console.log(`[ExecNewVersionAction] Cell ${targetCell.id} execution completed`);
      console.log(`[ExecNewVersionAction] Execution success: ${result?.success ?? true}`);

      return result;
    } catch (error) {
      console.error('[ExecNewVersionAction] Execution failed:', error);

      // Update metadata with failure
      const existingDebug = (targetCell.metadata?.debug || {}) as Partial<DebugMetadata>;
      notebookStore.updateCellMetadata(targetCell.id, {
        ...targetCell.metadata,
        debug: {
          ...existingDebug,
          executedAfterFix: true,
          executionSuccess: false,
        },
      });

      return { success: false, error: String(error) };
    }
  }
}

registerAction('exec_new_version', ExecNewVersionAction);
