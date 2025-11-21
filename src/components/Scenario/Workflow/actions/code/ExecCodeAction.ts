/**
 * ExecCodeAction - Executes code cells in the notebook
 * Ported from: ref/Notebook-BCC/actions/code/exec_code_action.py
 */

import { ActionBase, registerAction } from '../base';
import { ExecutionStep } from '../../store/useScriptStore';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class ExecCodeAction extends ActionBase {
  async execute(step: ExecutionStep): Promise<any> {
    if (!step.codecell_id) {
      console.warn('[ExecCodeAction] Requires codecell_id');
      return null;
    }

    const targetId =
      step.codecell_id === 'lastAddedCellId'
        ? this.scriptStore.lastAddedActionId
        : step.codecell_id;

    if (!targetId) {
      console.warn('[ExecCodeAction] No valid cell ID');
      return null;
    }

    console.log(`[ExecCodeAction] Executing code: ${targetId}`);

    // Show execution indicator
    globalUpdateInterface.createAIRunningCode('Executing...', '', [], targetId, true);

    try {
      const result = await this.scriptStore.execCodeCell(
        targetId,
        step.need_output ?? true,
        step.auto_debug ?? false
      );

      // Hide execution indicator
      globalUpdateInterface.createAIRunningCode('Execution completed', '', [], targetId, false);

      return result;
    } catch (error) {
      console.error('[ExecCodeAction] Execution failed:', error);
      globalUpdateInterface.createAIRunningCode('Execution failed', '', [], targetId, false);
      throw error;
    }
  }
}

registerAction('exec', ExecCodeAction);
