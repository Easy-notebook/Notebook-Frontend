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

    // Clear current effects before execution
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const workflowState = new WorkflowState(stateJSON);
    ClearEffectCurrentAction.processState(workflowState);
    stateMachine.setState(workflowState.toJSON());

    // Show execution indicator
    globalUpdateInterface.createAIRunningCode('Executing...', '', [], targetId, true);

    try {
      const result = await this.scriptStore.execCodeCell(
        targetId,
        step.need_output ?? true,
        step.auto_debug ?? false
      );

      // Update Workflow State with Effects
      // We do this here instead of in scriptStore to keep workflow logic separate
      if (result) {
        // Re-fetch the state machine since we already cleared effects earlier
        const currentStateMachine = useWorkflowStateMachine.getState();
        const currentWorkflowState = new WorkflowState(currentStateMachine.stateJSON);

        // Get outputs from result
        let outputs: any[] = result.outputs || [];

        // If no outputs in result but failed, try to get from notebookStore
        if (!outputs.length && !result.success) {
          const { default: useNotebookStore } = await import('@Store/notebookStore');
          const cell = useNotebookStore.getState().cells.find((c) => c.id === targetId);
          outputs = cell?.outputs || [];
        }

        if (outputs.length > 0) {
          outputs.forEach((item: any) => {
            const outputType = item.type || 'text';
            let effectContent = item.content || item.text || item.toString();

            if (outputType === 'error') {
              currentWorkflowState.state.effects.addCurrentEffect({
                type: 'error',
                error: {
                  name: 'ExecutionError',
                  message: effectContent,
                  traceback: [],
                },
                cell_ref: targetId,
              });
            } else if (outputType === 'image') {
              currentWorkflowState.state.effects.addCurrentEffect({
                type: 'image_url',
                image_url: effectContent,
                cell_ref: targetId,
              });
            } else {
              currentWorkflowState.state.effects.addCurrentEffect({
                type: 'text',
                text: effectContent,
                cell_ref: targetId,
              });
            }
          });

          currentStateMachine.setState(currentWorkflowState.toJSON());
          console.log(`[ExecCodeAction] Recorded ${outputs.length} effects for cell ${targetId}`);
        }
      }

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
