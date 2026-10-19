/**
 * Open Link Action - Handles open_link_in_split stream type
 * Previews notebook files in split view; HTTP(S) links follow the editor new-tab behavior.
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class OpenLinkAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    context.signal?.throwIfAborted();
    const { payload, showToast } = context;
    const target = payload.url || payload.filePath;
    if (typeof target !== 'string' || !target.trim())
      throw new Error('A link or file path is required');
    const title = payload.title || target;

    // Match the editor's existing link behavior: files split, web links open separately.
    if (/^https?:\/\//i.test(target)) {
      const url = new URL(target);
      window.open(url.href, '_blank', 'noopener,noreferrer');
      context.signal?.throwIfAborted();
      await showToast({ message: `已打开链接: ${title}`, type: 'success' });
      return;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//'))
      throw new Error('Only notebook file paths and HTTP(S) links are supported');

    const notebookId = context.notebookId || payload.notebook_id || useStore.getState().notebookId;
    if (!notebookId) throw new Error('A notebook is required to preview a file');
    const { default: usePreviewStore } = await import('@Store/previewStore');
    context.signal?.throwIfAborted();
    const file = await usePreviewStore
      .getState()
      .previewFileInSplit(notebookId, target, undefined, context.signal);
    context.signal?.throwIfAborted();
    if (!file)
      throw new Error(usePreviewStore.getState().error || 'Failed to open file in split preview');
    const preview = usePreviewStore.getState();
    if (preview.previewMode !== 'file') preview.changePreviewMode();
    context.signal?.throwIfAborted();
    await showToast({ message: `已在分屏中打开: ${title}`, type: 'success' });
  }
}

registerStreamAction('open_link_in_split', OpenLinkAction);
