/**
 * Update Allow Pagination Action - Handles update_allow_pagination stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdateAllowPaginationAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    const allow = payload.allow;
    if (typeof allow === 'boolean') {
      await globalUpdateInterface.setAllowPagination(allow);
      await showToast({
        message: `翻页权限已 ${allow ? '启用' : '禁用'}`,
        type: 'success',
      });
    }
  }
}

registerStreamAction('update_allow_pagination', UpdateAllowPaginationAction);
