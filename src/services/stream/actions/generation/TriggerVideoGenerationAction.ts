import { registerStreamAction } from '../base';
import { GenerationRequestAction } from './GenerationRequestAction';

export class TriggerVideoGenerationAction extends GenerationRequestAction {
  protected readonly kind = {
    command: 'video' as const,
    label: '视频',
    event: 'create-video',
    agent: 'video-generator',
  };
}

registerStreamAction('trigger_video_generation', TriggerVideoGenerationAction);
