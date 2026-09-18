/**
 * Open Link Action - Handles open_link_in_split stream type
 * Opens a file or URL in split view with preview
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class OpenLinkAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const url = payload?.url;
    const filePath = payload?.filePath;
    const title = payload?.title;

    const targetUrl = url || filePath;

    if (targetUrl) {
      console.log('[OpenLinkInSplit]', targetUrl);

      try {
        // Use dynamic import to avoid circular dependencies
        const { default: usePreviewStore } = await import('@Store/previewStore');

        // Open in split view
        usePreviewStore.getState().openPreview({
          url: targetUrl,
          title: title || targetUrl,
          type: filePath ? 'file' : 'web',
        });

        await showToast({
          message: `已在分屏中打开: ${title || targetUrl}`,
          type: 'success',
        });
      } catch (error) {
        console.error('Failed to open link in split:', error);
        await showToast({
          message: '打开分屏失败',
          type: 'error',
        });
      }
    }
  }
}

registerStreamAction('open_link_in_split', OpenLinkAction);
