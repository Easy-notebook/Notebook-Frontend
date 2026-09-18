/**
 * Video Generation Task Started Action - Handles video_generation_task_started stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import { videoPollingManager } from '../../managers/VideoPollingManager';

export class VideoGenerationTaskStartedAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    const taskId = payload.taskId;
    const commandId = payload.commandId;
    const uniqueIdentifier = payload.uniqueIdentifier;
    const prompt = payload.prompt;

    if (taskId && uniqueIdentifier) {
      console.log('视频生成任务已启动，开始轮询状态:', { taskId, uniqueIdentifier });

      // Start frontend status polling
      await videoPollingManager.startPolling({
        taskId,
        uniqueIdentifier,
        commandId,
        prompt,
      });

      await showToast({
        message: `视频生成任务已启动，正在后台处理...`,
        type: 'info',
      });
    }
  }
}

registerStreamAction('video_generation_task_started', VideoGenerationTaskStartedAction);
