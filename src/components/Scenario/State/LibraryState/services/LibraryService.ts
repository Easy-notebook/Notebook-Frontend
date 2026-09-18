import { IPersistenceService } from '../../../../../services/persistence/interfaces';
import useNotebookStore from '@Store/notebookStore';
import { NotebookORM } from '@Storage/index';
import { CachedNotebook, CONSTANTS } from '../types';
import { NotebookEntity } from '../../../../../services/persistence/interfaces';

export class LibraryService {
  constructor(private persistence: IPersistenceService) {}

  async loadNotebooks(): Promise<CachedNotebook[]> {
    console.log('🚀 Starting notebook loading process...');
    let allNotebooks: NotebookEntity[] = [];

    try {
      console.log('📚 Attempting to load notebooks from new storage system...');
      allNotebooks = await this.persistence.notebooks.getAllNotebooks({
        orderBy: 'lastAccessedAt',
      });
      console.log(`✅ Loaded ${allNotebooks.length} notebooks from new storage system`);
    } catch (error) {
      console.error('❌ New storage system failed:', error);
      return [];
    }

    if (allNotebooks.length === 0) {
      return [];
    }

    // Handle duplicates
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    allNotebooks.forEach((notebook) => {
      if (seenIds.has(notebook.id)) {
        duplicateIds.push(notebook.id);
      } else {
        seenIds.add(notebook.id);
      }
    });

    if (duplicateIds.length > 0) {
      console.warn('Found duplicate notebook IDs:', duplicateIds);
      allNotebooks = allNotebooks.map((notebook, index) => {
        const existingCount = allNotebooks
          .slice(0, index)
          .filter((n) => n.id === notebook.id).length;
        if (existingCount > 0) {
          const newId = `${notebook.id}_dup_${existingCount}`;
          return { ...notebook, id: newId };
        }
        return notebook;
      });
    }

    // Enrich notebooks
    return Promise.all(allNotebooks.map(async (notebook) => this.enrichNotebook(notebook)));
  }

  private async enrichNotebook(notebook: NotebookEntity): Promise<CachedNotebook> {
    try {
      let lastOpenedFiles: string[] = [];
      let displayName: string | undefined = notebook.name;

      // Get files
      try {
        const files = await this.persistence.files.getFilesForNotebook(notebook.id, false);
        lastOpenedFiles = files
          .slice(0, CONSTANTS.MAX_VISIBLE_FILES)
          .map((f: { metadata: { fileName: string } }) => f.metadata.fileName);
      } catch (fileError) {
        console.warn(`Failed to load files for notebook ${notebook.id}:`, fileError);
      }

      // Try to read main notebook file for accurate title
      try {
        const main = await this.persistence.files.getFile(
          notebook.id,
          `notebook_${notebook.id}.json`
        );
        const raw = main?.content;
        if (raw) {
          let text = typeof raw === 'string' ? raw : '';
          let data: {
            title?: string;
            notebookTitle?: string;
            cells?: Array<{
              cell_type?: string;
              cellType?: string;
              source?: string | string[];
              content?: string;
            }>;
          } | null = null;
          try {
            data = JSON.parse(text);
          } catch {
            // JSON parsing failed, data remains null
          }

          if (data) {
            let extractedTitle = data.title || data.notebookTitle;
            if (!extractedTitle && data.cells && Array.isArray(data.cells)) {
              for (const cell of data.cells) {
                if (cell.cell_type === 'markdown' || cell.cellType === 'markdown') {
                  const source = cell.source || cell.content || '';
                  const sourceText = Array.isArray(source) ? source.join('') : source;
                  const h1Match = sourceText.match(/^#\s+(.+)$/m);
                  if (h1Match) {
                    extractedTitle = h1Match[1].trim();
                    break;
                  }
                }
              }
            }
            if (extractedTitle && typeof extractedTitle === 'string') {
              displayName = extractedTitle;
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to parse notebook content for ${notebook.id}:`, e);
      }

      const finalName =
        displayName || notebook.name || `Notebook ${notebook.id?.slice(0, 8) || 'Unknown'}`;

      return {
        ...notebook,
        name: finalName,
        lastOpenedFiles,
        isStarred: false,
      } as CachedNotebook;
    } catch (err) {
      console.warn(`Failed to process notebook ${notebook.id}:`, err);
      return {
        ...notebook,
        name: notebook.name || `Notebook ${notebook.id?.slice(0, 8) || 'Unknown'}`,
        lastOpenedFiles: [],
        isStarred: false,
      } as CachedNotebook;
    }
  }

  async deleteNotebook(notebookId: string): Promise<boolean> {
    try {
      console.log(`🗑️ Starting deletion of notebook ${notebookId}`);
      await this.persistence.notebooks.deleteNotebook(notebookId);

      // Clear preview store
      try {
        const { default: usePreviewStore } = await import('@Store/previewStore');
        const previewStore = usePreviewStore.getState();
        if (previewStore.getCurrentNotebookId() === notebookId) {
          previewStore.resetToNotebookMode();
        }
      } catch (previewError) {
        console.warn('Failed to clear preview store:', previewError);
      }

      return true;
    } catch (error) {
      console.error(`❌ Failed to delete notebook ${notebookId}:`, error);
      return false;
    }
  }

  async exportNotebook(notebookId: string, notebooks: CachedNotebook[]): Promise<boolean> {
    try {
      console.log(`📤 Exporting notebook ${notebookId}`);
      const notebook = notebooks.find((n) => n.id === notebookId);
      if (!notebook) throw new Error('Notebook not found');

      const main = await this.persistence.files.getFile(notebookId, `notebook_${notebookId}.json`);
      if (!main?.content) throw new Error('Notebook content not found');

      const title = notebook.name || `Notebook ${notebookId.slice(0, 8)}`;
      const blob = new Blob([main.content as string], {
        type: 'application/json;charset=utf-8',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.easynb`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error(`❌ Failed to export notebook ${notebookId}:`, error);
      throw error;
    }
  }

  async loadNotebookContent(notebookId: string, notebooks: CachedNotebook[]): Promise<boolean> {
    const notebook = notebooks.find((n) => n.id === notebookId);
    if (!notebook) return false;

    try {
      console.log(`🔄 Loading notebook ${notebookId} from database...`);
      const store = useNotebookStore.getState();
      const loaded = await store.loadFromDatabase(notebookId);

      if (loaded) {
        const { default: usePreviewStore } = await import('@Store/previewStore');
        const previewStore = usePreviewStore.getState();

        previewStore.setCurrentPreviewFiles([]);
        previewStore.setActiveFile(null);
        previewStore.setActivePreviewMode(null);

        try {
          await previewStore.loadNotebookTabs(notebookId);
        } catch {
          // Tab loading error is non-critical, continue silently
        }
      } else {
        store.setNotebookId(notebook.id);
        store.setNotebookTitle(notebook.name || `Notebook ${notebook.id.slice(0, 8)}`);
        store.clearCells();
      }

      try {
        await NotebookORM.updateNotebookAccess(notebookId);
      } catch (error) {
        console.warn('Failed to update notebook access statistics:', error);
      }

      return true;
    } catch {
      // Fallback
      const store = useNotebookStore.getState();
      store.setNotebookId(notebook.id);
      store.setNotebookTitle(notebook.name || `Notebook ${notebook.id.slice(0, 8)}`);
      store.clearCells();
      return false;
    }
  }
}
