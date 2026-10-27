import { registerStreamAction } from '../base';
import { GenerationRequestAction } from './GenerationRequestAction';

export class TriggerWebpageGenerationAction extends GenerationRequestAction {
  protected readonly kind = {
    command: 'webpage' as const,
    label: '网页',
    event: 'generate-webpage',
    agent: 'webpage-generator',
  };
}

registerStreamAction('trigger_webpage_generation', TriggerWebpageGenerationAction);
