import {
  IPersistenceService,
  INotebookRepository,
  IFileRepository,
  ITabRepository,
  ISplitFileRepository,
  IStorageProvider,
} from './interfaces';
import { IndexedDBStorageProvider } from './providers/IndexedDBStorageProvider';
import { NotebookRepository } from './repositories/NotebookRepository';
import { FileRepository } from './repositories/FileRepository';
import { TabRepository } from './repositories/TabRepository';
import { SplitFileRepository } from './repositories/SplitFileRepository';

export class PersistenceService implements IPersistenceService {
  public notebooks: INotebookRepository;
  public files: IFileRepository;
  public tabs: ITabRepository;
  public splitFiles: ISplitFileRepository;
  private storage: IStorageProvider;

  constructor() {
    this.storage = new IndexedDBStorageProvider();
    this.notebooks = new NotebookRepository(this.storage);
    this.files = new FileRepository(this.storage);
    this.tabs = new TabRepository(this.storage);
    this.splitFiles = new SplitFileRepository(this.storage);
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}
