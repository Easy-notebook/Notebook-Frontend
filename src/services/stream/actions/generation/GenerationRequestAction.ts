import { StreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import { CapturedQAEvent } from '../../CapturedQAEvent';
import useStore from '@Store/notebookStore';

interface GenerationKind {
  command: 'image' | 'webpage' | 'video';
  label: string;
  event: string;
  agent: string;
}

/** Captures request and QA ownership once, before lazy operator loading or notifications. */
export abstract class GenerationRequestAction extends StreamAction {
  protected abstract readonly kind: GenerationKind;

  async execute(context: StreamActionContext): Promise<void> {
    const { prompt, commandId, QId } = context.payload;
    if (!prompt || !commandId) return;
    const state = useStore.getState();
    const notebookId = context.notebookId ?? state.notebookId;
    const command = {
      type: 'user_command',
      payload: {
        content: `/${this.kind.command} ${prompt}`,
        commandId,
        current_view_mode: context.viewMode ?? state.viewMode,
        current_phase_id: context.currentPhaseId ?? state.currentPhaseId,
        current_step_index: context.currentStepIndex ?? state.currentStepIndex,
        notebook_id: notebookId,
      },
    };
    const event = new CapturedQAEvent(
      { type: this.kind.event, content: prompt, agent: this.kind.agent },
      QId
    );
    // Operator loading remains lazy to avoid the stream-dispatch/operator import cycle.
    const { default: useOperatorStore } = await import('@Store/operatorStore');
    void useOperatorStore.getState().sendOperation(notebookId, command);
    await context.showToast({
      message: `开始生成${this.kind.label}: ${prompt.substring(0, 30)}...`,
      type: 'info',
    });
    event.record();
  }
}
