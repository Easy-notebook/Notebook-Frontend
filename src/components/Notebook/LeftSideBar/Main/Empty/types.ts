// LeftSideBar/Main/Empty/types.ts
// Type definitions for EmptySidebar components

import type { NotebookEntity } from '@Storage/schema';

export interface CachedNotebook extends NotebookEntity {
  title: string; // Alias for name
  isStarred?: boolean;
  cellCount?: number;
}

export interface NotebookHistoryCardProps {
  notebook: CachedNotebook;
  onSelect: (notebookId: string, notebookTitle?: string) => void;
  onToggleStar: (notebookId: string, e: React.MouseEvent) => void;
}

export interface EmptySidebarProps {
  // Additional props if needed in the future
}