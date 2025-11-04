import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * Storage-related logger class
 * Used for logging storage operations, cache operations, data persistence, etc.
 */
export class StorageLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('Storage', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '💾',
      customPrefix: '[STORAGE]',
      ...config
    });
  }

  /**
   * Log storage write operation
   */
  writeOperation(key: string, size?: number, type: 'localStorage' | 'sessionStorage' | 'indexedDB' = 'localStorage'): void {
    const builder = this.builder()
      .text('Write operation ')
      .badge(type, { backgroundColor: '#059669', color: '#FFFFFF' })
      .text(' Key: ')
      .code(key, 'text');
    
    if (size !== undefined) {
      builder.text(' Size: ')
        .badge(`${size}B`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
    }
    
    this.info(builder);
  }

  /**
   * Log storage read operation
   */
  readOperation(key: string, found: boolean, type: 'localStorage' | 'sessionStorage' | 'indexedDB' = 'localStorage'): void {
    const builder = this.builder()
      .text('Read operation ')
      .badge(type, { backgroundColor: '#3B82F6', color: '#FFFFFF' })
      .text(' Key: ')
      .code(key, 'text')
      .text(' Result: ')
      .badge(found ? 'Found' : 'Not Found', { 
        backgroundColor: found ? '#10B981' : '#F59E0B', 
        color: '#FFFFFF' 
      });
    
    this.debug(builder);
  }

  /**
   * Log storage delete operation
   */
  deleteOperation(key: string, type: 'localStorage' | 'sessionStorage' | 'indexedDB' = 'localStorage'): void {
    this.warn(
      this.builder()
        .text('Delete operation ')
        .badge(type, { backgroundColor: '#DC2626', color: '#FFFFFF' })
        .text(' Key: ')
        .code(key, 'text')
    );
  }

  /**
   * Log cache hit
   */
  cacheHit(key: string, hitRate?: number): void {
    const builder = this.builder()
      .text('Cache hit ')
      .badge('HIT', { backgroundColor: '#10B981', color: '#FFFFFF' })
      .text(' Key: ')
      .code(key, 'text');
    
    if (hitRate !== undefined) {
      builder.text(' Hit rate: ')
        .badge(`${(hitRate * 100).toFixed(1)}%`, { 
          backgroundColor: hitRate > 0.8 ? '#10B981' : '#F59E0B', 
          color: '#FFFFFF' 
        });
    }
    
    this.info(builder);
  }

  /**
   * Log cache miss
   */
  cacheMiss(key: string, reason?: string): void {
    const builder = this.builder()
      .text('Cache miss ')
      .badge('MISS', { backgroundColor: '#F59E0B', color: '#FFFFFF' })
      .text(' Key: ')
      .code(key, 'text');
    
    if (reason) {
      builder.text(' Reason: ')
        .text(reason);
    }
    
    this.warn(builder);
  }

  /**
   * Log storage usage
   */
  storageUsage(used: number, total: number, type: 'localStorage' | 'sessionStorage' | 'indexedDB' = 'localStorage'): void {
    const percentage = (used / total) * 100;
    const usageColor = percentage > 80 ? '#DC2626' : percentage > 60 ? '#F59E0B' : '#10B981';
    
    this.info(
      this.builder()
        .text('Storage usage ')
        .badge(type, { backgroundColor: '#6B7280', color: '#FFFFFF' })
        .text(' Used: ')
        .badge(`${(used / 1024).toFixed(2)}KB`, { backgroundColor: usageColor, color: '#FFFFFF' })
        .text(' Total: ')
        .badge(`${(total / 1024).toFixed(2)}KB`, { backgroundColor: '#9CA3AF', color: '#FFFFFF' })
        .text(' Usage: ')
        .badge(`${percentage.toFixed(1)}%`, { backgroundColor: usageColor, color: '#FFFFFF' })
    );
  }

  /**
   * Log storage error
   */
  storageError(operation: string, key: string, error: Error): void {
    this.error(
      this.builder()
        .text('Storage error ')
        .badge(operation.toUpperCase(), { backgroundColor: '#DC2626', color: '#FFFFFF' })
        .text(' Key: ')
        .code(key, 'text')
        .text(' Error: ')
        .text(error.message)
    );
  }

  /**
   * Log persistence operations
   */
  persistence(system: string, operation: 'save' | 'load' | 'clear' | 'init', details?: any): void {
    const operationColors = {
      'save': '#10B981',
      'load': '#3B82F6',
      'clear': '#DC2626',
      'init': '#8B5CF6'
    };

    const builder = this.builder()
      .text('Persistence ')
      .badge(system, { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' });

    if (details) {
      if (details.success !== undefined) {
        builder.text(' Status: ')
          .badge(details.success ? 'SUCCESS' : 'FAILED', { 
            backgroundColor: details.success ? '#10B981' : '#DC2626', 
            color: '#FFFFFF' 
          });
      }
      if (details.size !== undefined) {
        builder.text(' Size: ')
          .badge(`${(details.size / 1024).toFixed(2)}KB`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.duration !== undefined) {
        builder.text(' Duration: ')
          .badge(`${details.duration}ms`, { 
            backgroundColor: details.duration > 1000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.error) {
        builder.text(' Error: ')
          .text(details.error);
      }
    }

    if (operation === 'clear' || (details?.success === false)) {
      this.warn(builder);
    } else {
      this.info(builder);
    }
  }
}