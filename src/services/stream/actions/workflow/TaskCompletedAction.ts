import { CapturedQAEvent } from '../../CapturedQAEvent';
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

      const captured = new CapturedQAEvent(
        { type: 'task-completed', content: taskName, agent: 'task-manager', result },
        payload.QId
      );

      await showToast({
        message: `任务完成: ${taskName}`,
        type: 'success',
      });

      captured.record();
    }
  }
}

registerStreamAction('task_completed', TaskCompletedAction);
