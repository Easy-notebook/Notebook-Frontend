/**
 * Add Content To Answer Action - Handles addContentToAnswer stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import { QAViewPresenter } from './QAViewPresenter';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class AddContentToAnswerAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    context.signal?.throwIfAborted();
    const { payload } = context;

    console.log('添加内容到流式响应:', payload);
    const contentQid = payload.QId;
    const content = payload.content;

    if (contentQid !== undefined && contentQid !== null && content) {
      const qidStr = Array.isArray(contentQid) ? contentQid[0] : contentQid.toString();
      await globalUpdateInterface.addContentToAnswer(qidStr, content.toString());

      await QAViewPresenter.show(context.signal);
    } else {
      console.error('Missing QId or content in stream data:', payload);
    }
  }
}

registerStreamAction('addContentToAnswer', AddContentToAnswerAction);
