import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * File-related logger class
 * Used for logging file operations, tab management, preview operations, etc.
 */
export class FileLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('File', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '📁',
      customPrefix: '[FILE]',
      ...config
    });
  }

  /**
   * Log file operations
   */
  fileOperation(operation: 'open' | 'close' | 'save' | 'delete' | 'rename' | 'copy' | 'move', filePath: string, details?: any): void {
    const operationColors = {
      'open': '#10B981',
      'close': '#6B7280',
      'save': '#059669',
      'delete': '#DC2626',
      'rename': '#F59E0B',
      'copy': '#3B82F6',
      'move': '#8B5CF6'
    };

    const builder = this.builder()
      .text('File ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' })
      .text(' Path: ')
      .code(filePath, 'text');

    if (details) {
      if (details.size !== undefined) {
        builder.text(' Size: ')
          .badge(`${(details.size / 1024).toFixed(2)}KB`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.type) {
        builder.text(' Type: ')
          .badge(details.type, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.duration !== undefined) {
        builder.text(' Duration: ')
          .badge(`${details.duration}ms`, { 
            backgroundColor: details.duration > 1000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.newPath) {
        builder.text(' New Path: ')
          .code(details.newPath, 'text');
      }
    }

    if (operation === 'delete') {
      this.warn(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log tab management
   */
  tabManagement(action: 'create' | 'switch' | 'close' | 'restore' | 'move', tabInfo: string, details?: any): void {
    const actionColors = {
      'create': '#10B981',
      'switch': '#3B82F6',
      'close': '#F59E0B',
      'restore': '#8B5CF6',
      'move': '#6366F1'
    };

    const builder = this.builder()
      .text('Tab ')
      .badge(action.toUpperCase(), { backgroundColor: actionColors[action], color: '#FFFFFF' })
      .text(' Info: ')
      .text(tabInfo);

    if (details) {
      if (details.tabCount !== undefined) {
        builder.text(' Total Tabs: ')
          .badge(details.tabCount.toString(), { backgroundColor: '#6B7280', color: '#FFFFFF' });
      }
      if (details.activeTab) {
        builder.text(' Active: ')
          .code(details.activeTab, 'text');
      }
      if (details.fromIndex !== undefined && details.toIndex !== undefined) {
        builder.text(' Move: ')
          .badge(`${details.fromIndex}→${details.toIndex}`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
    }

    this.info(builder);
  }

  /**
   * Log file preview operations
   */
  previewOperation(operation: 'load' | 'refresh' | 'error' | 'cache_hit' | 'cache_miss', filePath: string, details?: any): void {
    const operationColors = {
      'load': '#3B82F6',
      'refresh': '#8B5CF6',
      'error': '#DC2626',
      'cache_hit': '#10B981',
      'cache_miss': '#F59E0B'
    };

    const builder = this.builder()
      .text('Preview ')
      .badge(operation.replace('_', ' ').toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' })
      .text(' Path: ')
      .code(filePath, 'text');

    if (details) {
      if (details.contentLength !== undefined) {
        builder.text(' Content: ')
          .badge(`${details.contentLength} chars`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.loadTime !== undefined) {
        builder.text(' Load Time: ')
          .badge(`${details.loadTime}ms`, { 
            backgroundColor: details.loadTime > 1000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.error) {
        builder.text(' Error: ')
          .text(details.error);
      }
      if (details.fromCache !== undefined) {
        builder.text(' Source: ')
          .badge(details.fromCache ? 'CACHE' : 'SERVER', { 
            backgroundColor: details.fromCache ? '#10B981' : '#3B82F6', 
            color: '#FFFFFF' 
          });
      }
    }

    if (operation === 'error') {
      this.error(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log file type detection
   */
  typeDetection(filePath: string, detectedType: string, confidence?: number, fallbackUsed?: boolean): void {
    const builder = this.builder()
      .text('Type Detection ')
      .text('File: ')
      .code(filePath, 'text')
      .text(' Type: ')
      .badge(detectedType, { backgroundColor: '#6366F1', color: '#FFFFFF' });

    if (confidence !== undefined) {
      builder.text(' Confidence: ')
        .badge(`${(confidence * 100).toFixed(1)}%`, { 
          backgroundColor: confidence > 0.8 ? '#10B981' : confidence > 0.5 ? '#F59E0B' : '#DC2626', 
          color: '#FFFFFF' 
        });
    }

    if (fallbackUsed) {
      builder.text(' ')
        .badge('FALLBACK', { backgroundColor: '#F59E0B', color: '#FFFFFF' });
    }

    this.debug(builder);
  }

  /**
   * Log file caching operations
   */
  caching(operation: 'store' | 'retrieve' | 'evict' | 'clear', fileId: string, details?: any): void {
    const operationColors = {
      'store': '#10B981',
      'retrieve': '#3B82F6',
      'evict': '#F59E0B',
      'clear': '#DC2626'
    };

    const builder = this.builder()
      .text('Cache ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' })
      .text(' File ID: ')
      .code(fileId, 'text');

    if (details) {
      if (details.cacheSize !== undefined) {
        builder.text(' Cache Size: ')
          .badge(`${(details.cacheSize / 1024).toFixed(2)}KB`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.hitRate !== undefined) {
        builder.text(' Hit Rate: ')
          .badge(`${(details.hitRate * 100).toFixed(1)}%`, { 
          backgroundColor: details.hitRate > 0.8 ? '#10B981' : '#F59E0B', 
          color: '#FFFFFF' 
        });
      }
      if (details.evictionReason) {
        builder.text(' Reason: ')
          .text(details.evictionReason);
      }
    }

    this.debug(builder);
  }

  /**
   * Log file processing
   */
  processing(stage: 'start' | 'parse' | 'transform' | 'validate' | 'complete', filePath: string, details?: any): void {
    const stageColors = {
      'start': '#3B82F6',
      'parse': '#8B5CF6',
      'transform': '#6366F1',
      'validate': '#F59E0B',
      'complete': '#10B981'
    };

    const builder = this.builder()
      .text('Processing ')
      .badge(stage.toUpperCase(), { backgroundColor: stageColors[stage], color: '#FFFFFF' })
      .text(' File: ')
      .code(filePath, 'text');

    if (details) {
      if (details.progress !== undefined) {
        builder.text(' Progress: ')
          .badge(`${details.progress}%`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.processingTime !== undefined) {
        builder.text(' Time: ')
          .badge(`${details.processingTime}ms`, { 
            backgroundColor: details.processingTime > 1000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.errors && details.errors.length > 0) {
        builder.text(' Errors: ')
          .badge(details.errors.length.toString(), { backgroundColor: '#DC2626', color: '#FFFFFF' });
      }
    }

    this.debug(builder);
  }

  /**
   * Log file validation
   */
  validation(filePath: string, validationType: string, isValid: boolean, issues?: string[]): void {
    const builder = this.builder()
      .text('Validation ')
      .badge(validationType.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' File: ')
      .code(filePath, 'text')
      .text(' Result: ')
      .badge(isValid ? 'VALID' : 'INVALID', { 
        backgroundColor: isValid ? '#10B981' : '#DC2626', 
        color: '#FFFFFF' 
      });

    if (issues && issues.length > 0) {
      builder.text(' Issues: ')
        .code(issues.join(', '), 'text');
    }

    if (isValid) {
      this.debug(builder);
    } else {
      this.warn(builder);
    }
  }

  /**
   * Log file system events
   */
  fileSystemEvent(event: 'watch_start' | 'watch_stop' | 'change' | 'add' | 'unlink' | 'error', path: string, details?: any): void {
    const eventColors = {
      'watch_start': '#10B981',
      'watch_stop': '#6B7280',
      'change': '#3B82F6',
      'add': '#059669',
      'unlink': '#DC2626',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('FS Event ')
      .badge(event.replace('_', ' ').toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' })
      .text(' Path: ')
      .code(path, 'text');

    if (details) {
      if (details.changeType) {
        builder.text(' Change: ')
          .badge(details.changeType, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.stats) {
        builder.text(' Size: ')
          .badge(`${(details.stats.size / 1024).toFixed(2)}KB`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
    }

    if (event === 'error') {
      this.error(builder);
    } else {
      this.debug(builder);
    }
  }

  /**
   * Log split view operations
   */
  splitView(operation: 'open' | 'close' | 'switch' | 'resize', details?: any): void {
    const operationColors = {
      'open': '#10B981',
      'close': '#F59E0B',
      'switch': '#3B82F6',
      'resize': '#8B5CF6'
    };

    const builder = this.builder()
      .text('Split View ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' });

    if (details) {
      if (details.leftFile) {
        builder.text(' Left: ')
          .code(details.leftFile, 'text');
      }
      if (details.rightFile) {
        builder.text(' Right: ')
          .code(details.rightFile, 'text');
      }
      if (details.ratio) {
        builder.text(' Ratio: ')
          .badge(`${details.ratio}%`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
    }

    this.info(builder);
  }
}