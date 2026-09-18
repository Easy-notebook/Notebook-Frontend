/**
 * Task Failed Action - Handles task_failed stream type
 * Notifies when a task fails
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class TaskFailedAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const taskName = payload?.taskName || payload?.task;
    const error = payload?.error || payload?.reason;

    if (taskName) {
      console.error(`[TaskFailed] ${taskName}:`, error);

      await showToast({
        message: `任务失败: ${taskName}`,
        type: 'error',
      });

      // Record to agent memory
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];

        if (runningQA) {
          state.addToolCallToQA(runningQA.id, {
            type: 'task-failed',
            content: taskName,
            agent: 'task-manager',
            error: error,
          });
        }
      } catch (err) {
        console.error('Failed to record task failure:', err);
      }
    }
  }
}

registerStreamAction('task_failed', TaskFailedAction);
