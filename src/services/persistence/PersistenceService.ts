import {
  IPersistenceService,
  INotebookRepository,
  IFileRepository,
  ITabRepository,
  ISplitFileRepository,
  IStorageProvider,
  IStorageMaintenanceRepository,
} from './interfaces';
import { IndexedDBStorageProvider } from './providers/IndexedDBStorageProvider';
import { NotebookRepository } from './repositories/NotebookRepository';
import { FileRepository } from './repositories/FileRepository';
import { TabRepository } from './repositories/TabRepository';
import { StorageMaintenanceRepository } from './repositories/StorageMaintenanceRepository';
import { SplitFileRepository } from './repositories/SplitFileRepository';

export class PersistenceService implements IPersistenceService {
  public maintenance: IStorageMaintenanceRepository;
  public notebooks: INotebookRepository;
  public files: IFileRepository;
  public tabs: ITabRepository;
  public splitFiles: ISplitFileRepository;
  private storage: IStorageProvider;

  constructor() {
    this.storage = new IndexedDBStorageProvider();
    this.maintenance = new StorageMaintenanceRepository(this.storage);
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
