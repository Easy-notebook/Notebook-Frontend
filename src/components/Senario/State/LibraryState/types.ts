// LibraryState/types.ts
// Type definitions for LibraryState components

import type { NotebookEntity } from '@Storage/schema';

export interface LibraryStateProps {
  onBack?: () => void;
  onSelectNotebook?: (notebookId: string, notebookTitle: string) => void;
}

export interface CachedNotebook extends NotebookEntity {
  isStarred?: boolean;
  lastOpenedFiles?: string[];
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
}

export interface NotebookListProps {
  notebooks: CachedNotebook[];
  viewMode: ViewMode;
  onSelectNotebook: (notebookId: string) => void;
  onToggleStar: (notebookId: string, e: React.MouseEvent) => void;
  onDeleteNotebook: (notebookId: string) => void;
  onExportNotebook?: (notebookId: string) => void;
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

export interface NotebookStatsProps {
  fileCount?: number;
  accessCount?: number;
  totalSize?: number;
}

export interface FileTagsProps {
  files?: string[];
  maxVisible?: number;
}

export interface NotebookAvatarProps {
  id: string;
  size?: number;
}

// Constants
export const CONSTANTS = {
  SWIPE_THRESHOLD: 50,
  MAX_SWIPE_DISTANCE: 100,
  DEBOUNCE_DELAY: 300,
  MAX_VISIBLE_FILES: 3,
  TRUNCATE_LENGTH: 12,
} as const;