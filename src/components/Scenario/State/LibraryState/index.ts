// LibraryState/index.ts
// Main exports for LibraryState components

export { default as LibraryHeader } from './views/components/LibraryHeader';
export { default as NotebookCard } from './views/components/NotebookCard';
export { default as NotebookList } from './views/components/NotebookList';
export { default as SwipeIndicator } from './views/components/SwipeIndicator';
export { default as StorageCleanupTool } from './views/components/StorageCleanupTool';

export * from './types';
export * from './utils';
export * from './controllers/LibraryController';
export * from './services/LibraryService';

// Main component
export { default } from './views/LibraryView';
