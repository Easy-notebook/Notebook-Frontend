import { Cell as StoreCell } from '@Store/models';
import useStore from '@Store/notebookStore';
import usePreviewStore from '@Store/previewStore';
import { Backend_BASE_URL } from '@Config/base_url';
import { uiLog } from '@Utils/logger';
import { getFileTypeIconProps, initializeFileTypeIcons } from '@fluentui/react-file-type-icons';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

// Initialize file type icons
initializeFileTypeIcons();

export class LinkCellViewModel extends BaseCellViewModel {
  // Local state
  // None specific for now, mostly derived state

  constructor(cell: StoreCell) {
    super(cell);
  }

  // Getters
  get notebookId() {
    return useStore.getState().notebookId;
  }

  get detachedCellId() {
    return useStore.getState().detachedCellId;
  }

  get isDetachedCellFullscreen() {
    return useStore.getState().isDetachedCellFullscreen;
  }

  get isDetached() {
    return this.detachedCellId === this.cell.id;
  }

  get parsedContent() {
    return this.parseContent(this.cell.content || '');
  }

  get href() {
    return this.parsedContent.href;
  }

  get label() {
    return this.parsedContent.label;
  }

  get fileExtension() {
    if (!this.href) return '';

    // Extract extension from href path
    const pathParts = this.href.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }

  get iconProps() {
    if (!this.href) return getFileTypeIconProps({ extension: 'generic', size: 32 });

    // Special handling for URLs
    if (/^https?:\/\//i.test(this.href)) {
      return getFileTypeIconProps({ extension: 'html', size: 32 });
    }

    // Use extension from href path
    const extension = this.fileExtension || 'generic';
    return getFileTypeIconProps({
      extension,
      size: 32,
    });
  }

  // Actions
  public setDetachedCellId(id: string | null) {
    useStore.getState().setDetachedCellId(id);
  }

  public toggleDetachedCellFullscreen = () => {
    useStore.getState().toggleDetachedCellFullscreen();
  };

  public handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    useStore.getState().updateCell(this.cell.id, e.target.value);
  };

  public openInSplitPreview = async () => {
    uiLog.userInteraction('openInSplitPreview', 'LinkCell', {
      cellContent: this.cell.content,
      notebookId: this.notebookId,
    });
    this.setDetachedCellId(this.cell.id);

    if (!this.href || !this.notebookId) {
      uiLog.warn('LinkCell: Missing href or notebookId');
      return;
    }

    // Parse the content to get the actual URL (href is already parsed from content)
    uiLog.debug('LinkCell: Using parsed href', { href: this.href });
    const filePath = this.normalizeFilePath(this.href);
    uiLog.debug('LinkCell: normalizeFilePath result', { filePath, href: this.href });

    if (!filePath) {
      uiLog.info('LinkCell: No valid file path, opening external URL');
      const a = document.createElement('a');
      a.href = this.href;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      const fileObj = {
        name: filePath.split('/').pop() || filePath,
        path: filePath,
        type: 'file' as const,
      };
      uiLog.info('LinkCell: Calling previewFileInSplit', {
        notebookId: this.notebookId,
        filePath,
        fileObj,
      });
      await usePreviewStore
        .getState()
        .previewFileInSplit(this.notebookId, filePath, { file: fileObj });
      uiLog.info('LinkCell: previewFileInSplit completed successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      uiLog.error('LinkCell: Open split preview failed', { error });
      try {
        const baseName = (filePath || this.href).split('/').pop() || '';
        uiLog.info('LinkCell: Trying fallback with baseName', { baseName });
        if (baseName && baseName !== filePath) {
          const fileObj2 = { name: baseName, path: baseName, type: 'file' as const };
          await usePreviewStore
            .getState()
            .previewFileInSplit(this.notebookId, baseName, { file: fileObj2 });
          uiLog.info('LinkCell: Fallback previewFileInSplit completed');
        }
      } catch (e) {
        uiLog.error('LinkCell: Fallback to root failed', { error: e });
      }
    }
  };

  // Helpers
  private parseContent(content: string): { href: string; label: string } {
    // 使用更宽松的匹配，寻找最后一个括号对
    const match = content.match(/^\[([^\]]*)\]\((.+)\)$/);
    if (match) {
      const label = match[1].trim();
      const href = match[2].trim();
      return { href, label };
    }

    const href = (content || '').trim();
    const label = href.split(/[\\/]/).pop() || href;
    return { href, label };
  }

  private normalizeFilePath(url: string): string | null {
    try {
      const base = Backend_BASE_URL?.replace(/\/$/, '');

      // Check for download_file pattern
      const downloadPattern = new RegExp(`^${base}/download_file/${this.notebookId}/(.+)$`);
      const downloadMatch = url.match(downloadPattern);
      if (downloadMatch && downloadMatch[1]) {
        return decodeURIComponent(downloadMatch[1]);
      }

      // Check for assets pattern - should return assets/filename
      const assetsPattern = new RegExp(`^${base}/assets/${this.notebookId}/(.+)$`);
      const assetsMatch = url.match(assetsPattern);
      if (assetsMatch && assetsMatch[1]) {
        return `assets/${decodeURIComponent(assetsMatch[1])}`;
      }
    } catch (e) {
      uiLog.warn('normalizeFilePath: Pattern matching error', { error: e });
    }

    const relPattern = new RegExp(
      '^(\\.|\\.\\.|[^:/?#]+$|\\.\\/\\.(assets|sandbox)\\/|\\.(assets|sandbox)\\/)'
    );
    if (relPattern.test(url)) {
      return url.replace(new RegExp('^\\./'), '');
    }

    if (!/^[a-z]+:\/\//i.test(url) && url.indexOf('/') === -1) {
      return url;
    }

    return null;
  }
}
