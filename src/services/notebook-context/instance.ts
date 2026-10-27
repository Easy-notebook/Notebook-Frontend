import { persistenceService } from '../persistence/instance';
import { NotebookContextService } from './NotebookContextService';
export const notebookContextService = new NotebookContextService(persistenceService.files);
