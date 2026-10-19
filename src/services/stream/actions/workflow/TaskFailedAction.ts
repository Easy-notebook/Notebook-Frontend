import { CapturedQAEvent } from '../../CapturedQAEvent';
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

      const captured = new CapturedQAEvent(
        { type: 'task-failed', content: taskName, agent: 'task-manager', error },
        payload.QId
      );

      await showToast({
        message: `任务失败: ${taskName}`,
        type: 'error',
      });

      captured.record();
    }
  }
}

registerStreamAction('task_failed', TaskFailedAction);
