import { registerStreamAction } from '../base';
import { GenerationRequestAction } from './GenerationRequestAction';

export class TriggerImageGenerationAction extends GenerationRequestAction {
  protected readonly kind = {
    command: 'image' as const,
    label: '图片',
    event: 'draw-image',
    agent: 'image-generator',
  };
}

registerStreamAction('trigger_image_generation', TriggerImageGenerationAction);
