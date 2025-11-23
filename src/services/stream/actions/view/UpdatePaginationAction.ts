/**
 * Update Pagination Action - Handles update_allow_pagination stream type
 * Controls whether pagination is allowed in the current view
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdatePaginationAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const allow = payload?.allow;

    if (typeof allow === 'boolean') {
      globalUpdateInterface.setAllowPagination(allow);
    }
  }
}

registerStreamAction('update_allow_pagination', UpdatePaginationAction);
