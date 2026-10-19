/**
 * Add Cell Full Action - Handles add_cell stream type
 * Adds a new cell using a complete cell object
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class AddCellFullAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const cell = payload?.cell;
    const position = payload?.position; // 'start', 'end', or specific index

    if (!cell || typeof cell !== 'object' || Array.isArray(cell))
      throw new Error('add_cell requires a cell object');
    if (cell.id !== undefined && typeof cell.id !== 'string')
      throw new Error('Cell identity must be a string');
    if (
      position !== undefined &&
      position !== 'start' &&
      position !== 'end' &&
      (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0)
    )
      throw new Error('Cell position must be start, end, or a nonnegative safe integer');

    const index = position === 'start' ? 0 : typeof position === 'number' ? position : undefined;
    useStore.getState().addCell(cell, index);
  }
}

registerStreamAction('add_cell', AddCellFullAction);
