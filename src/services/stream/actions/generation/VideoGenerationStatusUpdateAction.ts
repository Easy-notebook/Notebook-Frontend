/**
 * Video Generation Status Update Action - Handles video_generation_status_update stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import { videoPollingManager } from '../../managers/VideoPollingManager';

export class VideoGenerationStatusUpdateAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    const taskId = payload.taskId;
    const status = payload.status;
    const videoUrl = payload.videoUrl;
    const uniqueIdentifier = payload.uniqueIdentifier;
    const prompt = payload.prompt;
    const error = payload.error;

    console.log('收到视频生成状态更新:', { taskId, status, uniqueIdentifier });

    if (!uniqueIdentifier) {
      console.error('❌ Missing uniqueIdentifier for video status update');
      return;
    }

    if (status === 'completed' && videoUrl) {
      // Generation completed, stop polling
      if (taskId) {
        videoPollingManager.stopPolling(taskId);
      }

      // Update cell content
      const videoMarkdown = `![${prompt || 'Generated Video'}](${videoUrl})`;
      const contentSuccess = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
        content: videoMarkdown,
      });

      // Update cell metadata
      const metadataSuccess = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
        metadata: {
          isGenerating: false,
          generationCompleted: true,
          generationEndTime: Date.now(),
          videoUrl: videoUrl,
          generationStatus: 'completed',
        },
      });

      if (contentSuccess && metadataSuccess) {
        console.log('✅ 视频生成完成，内容已更新');
        await showToast({
          message: `视频生成完成！`,
          type: 'success',
        });
      }
    } else if (status === 'failed' || error) {
      // Generation failed, stop polling
      if (taskId) {
        videoPollingManager.stopPolling(taskId);
      }

      // Update failed status
      const success = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
        metadata: {
          isGenerating: false,
          generationError: error || 'Generation failed',
          generationStatus: 'failed',
        },
      });

      if (success) {
        console.log('❌ 视频生成失败状态已更新');
        await showToast({
          message: `视频生成失败: ${error || 'Unknown error'}`,
          type: 'error',
        });
      }
    }
    // For 'waiting', 'active', 'queued', 'generating' statuses, continue waiting for polling
  }
}

registerStreamAction('video_generation_status_update', VideoGenerationStatusUpdateAction);
