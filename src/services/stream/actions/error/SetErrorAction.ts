import { CapturedQAEvent } from '../../CapturedQAEvent';
/**
 * Set Error Action - Handles set_error stream type
 * Sets global error state and records to agent memory
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class SetErrorAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const error = payload?.error;
    const details = payload?.details;

    if (error) {
      const captured = new CapturedQAEvent(
        { type: 'error', content: error, details, agent: 'system' },
        payload.QId
      );
      useStore.getState().setError(error);

      await showToast({
        message: error,
        type: 'error',
      });

      captured.record();

      console.error('[SetError]', error, details);
    }
  }
}

registerStreamAction('set_error', SetErrorAction);
