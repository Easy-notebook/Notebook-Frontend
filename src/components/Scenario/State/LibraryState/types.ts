// LibraryState/types.ts
// Type definitions for LibraryState components

import type {
  LibraryStateProps,
  CachedNotebook,
  ViewMode,
  SortBy,
  BentoSize,
  NotebookCardProps,
  NotebookListProps,
  LibraryHeaderProps,
  NotebookStatsProps,
  FileTagsProps,
  NotebookAvatarProps,
} from '@Store/models';
export type {
  LibraryStateProps,
  CachedNotebook,
  ViewMode,
  SortBy,
  BentoSize,
  NotebookCardProps,
  NotebookListProps,
  LibraryHeaderProps,
  NotebookStatsProps,
  FileTagsProps,
  NotebookAvatarProps,
};

// Constants
export const CONSTANTS = {
  SWIPE_THRESHOLD: 50,
  MAX_SWIPE_DISTANCE: 100,
  DEBOUNCE_DELAY: 300,
  MAX_VISIBLE_FILES: 3,
  TRUNCATE_LENGTH: 12,
} as const;
