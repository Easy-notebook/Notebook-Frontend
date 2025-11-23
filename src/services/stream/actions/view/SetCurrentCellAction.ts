/**
 * Set Current Cell Action - Handles set_current_cell stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class SetCurrentCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;

    const cellId = payload.cellId;
    if (cellId) {
      await globalUpdateInterface.setCurrentCell(cellId);
    }
  }
}

registerStreamAction('set_current_cell', SetCurrentCellAction);
