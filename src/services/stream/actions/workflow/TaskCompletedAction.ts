/**
 * Task Completed Action - Handles task_completed stream type
 * Notifies when a task is successfully completed
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class TaskCompletedAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const taskName = payload?.taskName || payload?.task;
    const result = payload?.result;

    if (taskName) {
      console.log(`[TaskCompleted] ${taskName}`, result);

      await showToast({
        message: `任务完成: ${taskName}`,
        type: 'success',
      });

      // Record to agent memory
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];

        if (runningQA) {
          state.addToolCallToQA(runningQA.id, {
            type: 'task-completed',
            content: taskName,
            agent: 'task-manager',
            result: result,
          });
        }
      } catch (error) {
        console.error('Failed to record task completion:', error);
      }
    }
  }
}

registerStreamAction('task_completed', TaskCompletedAction);
