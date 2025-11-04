# Storage ORM System

A comprehensive ORM system for managing notebook and file relationships with intelligent caching, soft references for large files, and automatic cleanup.

## Features

- **Notebook-centric ORM**: Track notebooks and their associated files
- **Smart file storage**: Large files use soft references (metadata only), small files stored locally
- **Automatic cleanup**: Remove inactive notebooks and enforce size limits
- **Activity tracking**: Monitor notebook and file usage patterns
- **Legacy compatibility**: Drop-in replacement for existing FileCache API

## Architecture

```
Storage System
├── NotebookORM      # Notebook entity management
├── FileORM          # File storage with soft references
├── StorageManager   # Cleanup and maintenance
├── Database         # IndexedDB connection pool
└── Schema          # Data models and configuration
```

## Database Schema

### Stores
- `notebooks`: Notebook metadata and statistics
- `files_metadata`: File metadata with storage strategy info
- `files_content`: Actual file content (only for smaller files)
- `activities`: Notebook usage activity log
- `config`: Storage system configuration

### Storage Strategy
- **Small files** (< 10MB): Content stored locally in `files_content`
- **Large files** (≥ 10MB): Only metadata stored, content referenced from backend
- **Hybrid approach**: Can promote large files to local storage when accessed frequently

## Usage Examples

### Initialize Storage
```typescript
import { initializeStorage } from '../storage';

// Initialize the storage system
await initializeStorage();
```

### Working with Notebooks
```typescript
import { NotebookORM } from '../storage';

// Create/update a notebook
const notebook = await NotebookORM.saveNotebook({
  id: 'my-notebook-123',
  name: 'My Research Notebook',
  description: 'Machine learning experiments',
  lastAccessedAt: Date.now(),
  accessCount: 0,
  fileCount: 0,
  totalSize: 0,
  cacheEnabled: true
});

// Get a notebook
const notebook = await NotebookORM.getNotebook('my-notebook-123');

// Get all notebooks (with pagination and sorting)
const notebooks = await NotebookORM.getNotebooks({
  orderBy: 'lastAccessedAt',
  limit: 10,
  offset: 0
});

// Get notebook statistics
const stats = await NotebookORM.getNotebookStats('my-notebook-123');
console.log(stats.fileCount, stats.totalSize, stats.activities);
```

### Working with Files
```typescript
import { FileORM } from '../storage';

// Save a file (automatically determines storage strategy)
const metadata = await FileORM.saveFile({
  notebookId: 'my-notebook-123',
  filePath: 'data/experiment.csv',
  fileName: 'experiment.csv',
  content: csvContent,
  lastModified: new Date().toISOString(),
  size: csvContent.length,
  remoteUrl: 'https://backend.com/files/experiment.csv' // Optional
});

// Get a file
const result = await FileORM.getFile('my-notebook-123', 'data/experiment.csv');
if (result) {
  if (result.content) {
    // File content available locally
    console.log('Local content:', result.content);
  } else if (result.needsRemoteFetch) {
    // Large file - need to fetch from backend
    console.log('Remote URL:', result.metadata.remoteUrl);
    console.log('Preview:', result.metadata.contentPreview);
  }
}

// Get all files for a notebook
const files = await FileORM.getFilesForNotebook('my-notebook-123', true);

// Update file content (promotes large files to local storage)
await FileORM.updateFileContent('my-notebook-123', 'data/experiment.csv', newContent);

// Get large files (for maintenance)
const largeFiles = await FileORM.getLargeFiles('my-notebook-123');
```

### Storage Management
```typescript
import { StorageManager } from '../storage';

// Get storage statistics
const stats = await StorageManager.getStorageStats();
console.log(`${stats.totalNotebooks} notebooks, ${stats.totalFiles} files`);

// Manual cleanup
const cleanupStats = await StorageManager.cleanupStorage();
console.log(`Freed ${cleanupStats.bytesFreed} bytes`);

// Get cleanup candidates
const candidates = await StorageManager.getCleanupCandidates();
console.log(`${candidates.inactive.length} inactive notebooks`);

// Clean up specific notebook
await StorageManager.cleanupNotebook('old-notebook-456');

// Update storage configuration
await StorageManager.updateConfig({
  maxNotebooks: 100,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  retentionPeriod: 14 * 24 * 60 * 60 * 1000 // 14 days
});
```

### Legacy API Compatibility
```typescript
// Old API still works
import { FileCache } from '../storage';

const file = await FileCache.getFile(notebookId, filePath);
await FileCache.saveFile(fileData);
await FileCache.deleteFile(notebookId, filePath);
```

## Configuration

Default configuration can be customized:

```typescript
const config = {
  maxNotebooks: 50,           // Maximum number of notebooks to cache
  maxTotalSize: 500 * 1024 * 1024,  // 500MB total cache size
  maxFileSize: 10 * 1024 * 1024,    // 10MB - larger files use soft references
  cleanupInterval: 60 * 60 * 1000,  // Cleanup every hour
  retentionPeriod: 7 * 24 * 60 * 60 * 1000,  // Keep notebooks for 7 days
  compressionEnabled: true
};
```

## Automatic Cleanup

The system automatically:

1. **Removes inactive notebooks** older than retention period
2. **Enforces notebook limits** by removing least recently accessed
3. **Cleans up orphaned activities** and content
4. **Runs scheduled maintenance** every hour
5. **Performs emergency cleanup** when storage is full

## Activity Tracking

All notebook and file operations are tracked:

- `open`: Notebook accessed
- `close`: Notebook closed  
- `file_access`: File read
- `file_create`: File created/updated
- `file_delete`: File deleted

Activities are used for:
- Determining inactive notebooks
- Usage analytics
- Cleanup decisions

## Migration from Old System

The system provides backward compatibility, so existing code continues to work:

```typescript
// This still works
const file = await FileCache.getFile(notebookId, filePath);
```

New code should use the ORM APIs for better control:

```typescript
// Better
const result = await FileORM.getFile(notebookId, filePath);
if (result?.needsRemoteFetch) {
  // Handle large file
}
```