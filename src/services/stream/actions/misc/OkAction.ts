/**
 * Ok Action - Handles ok stream type
 * Confirms successful operation completion
 * Usually doesn't require special handling but can be used for logging
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class OkAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const message = payload?.message;

    // Just log for debugging, no UI action needed
    console.log('[OK]', message || 'Operation completed successfully');
  }
}

registerStreamAction('ok', OkAction);
