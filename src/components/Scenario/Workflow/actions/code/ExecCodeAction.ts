/**
 * ExecCodeAction - Executes code cells in the notebook
 * Ported from: ref/Notebook-BCC/actions/code/exec_code_action.py
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';
import { WorkflowState } from '../../observation/WorkflowState';
import { ClearEffectCurrentAction } from '../reflecting/ClearEffectCurrent';

export class ExecCodeAction extends ActionBase {
  async execute(step: ExecutionStep, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted();
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

    // Clear current effects before execution
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const workflowState = new WorkflowState(structuredClone(stateJSON));
    ClearEffectCurrentAction.processState(workflowState);
    stateMachine.setState(workflowState.toJSON());

    signal?.throwIfAborted();

    // Show execution indicator
    globalUpdateInterface.createAIRunningCode('Executing...', '', [], targetId, true);

    try {
      const result = await this.scriptStore.execCodeCell(
        targetId,
        step.need_output ?? true,
        step.auto_debug ?? false,
        signal
      );

      signal?.throwIfAborted();
      // The execution session owns output publication. Invalidated executions return false.
      if (result === false) return result;

      // Hide execution indicator
      globalUpdateInterface.createAIRunningCode('Execution completed', '', [], targetId, false);

      return result;
    } catch (error) {
      signal?.throwIfAborted();
      console.error('[ExecCodeAction] Execution failed:', error);
      globalUpdateInterface.createAIRunningCode('Execution failed', '', [], targetId, false);
      throw error;
    }
  }
}

registerAction('exec', ExecCodeAction);
