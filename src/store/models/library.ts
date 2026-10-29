// src/store/models/library.ts
import type { NotebookEntity } from '@Storage/schema';

export interface LibraryStateProps {
  onBack?: () => void;
  onSelectNotebook?: (notebookId: string, notebookTitle: string) => void;
}

export interface CachedNotebook extends NotebookEntity {
  isStarred?: boolean;
  lastOpenedFiles?: string[];
  presentation?: {
    kind: 'document' | 'project' | 'chat';
    providers: Array<'codex' | 'claude'>;
    preview: string;
  };
}

export type ViewMode = 'grid' | 'list';
export type SortBy = 'recent' | 'name' | 'size' | 'files';

export interface NotebookCardProps {
  notebook: CachedNotebook;
  viewMode: ViewMode;
  onSelect: (notebookId: string) => void;
  onToggleStar: (notebookId: string, e: React.MouseEvent) => void;
  onDelete: (notebookId: string) => void;
  onExport?: (notebookId: string) => void;
  onCustomize?: (notebookId: string) => void;
}

export interface NotebookListProps {
  notebooks: CachedNotebook[];
  viewMode: ViewMode;
  onSelectNotebook: (notebookId: string) => void;
  onToggleStar: (notebookId: string, e: React.MouseEvent) => void;
  onDeleteNotebook: (notebookId: string) => void;
  onExportNotebook?: (notebookId: string) => void;
  onCustomize?: (notebookId: string) => void;
}

export interface LibraryHeaderProps {
  totalNotebooks: number;
  totalSize: number;
  searchQuery: string;
  viewMode: ViewMode;
  refreshing: boolean;
  onBack?: () => void;
  onSearchChange: (query: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onRefresh: () => void;
}
