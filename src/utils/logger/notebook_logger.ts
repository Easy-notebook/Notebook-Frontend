import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * Notebook-related logger class
 * Used for logging notebook operations, cell management, workflow execution, etc.
 */
export class NotebookLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('Notebook', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '📓',
      customPrefix: '[NOTEBOOK]',
      ...config
    });
  }

  /**
   * Log cell operations
   */
  cellOperation(operation: 'create' | 'update' | 'delete' | 'move', cellId: string, details?: any): void {
    const operationColors = {
      'create': '#10B981',
      'update': '#3B82F6',
      'delete': '#DC2626',
      'move': '#8B5CF6'
    };

    const builder = this.builder()
      .text('Cell ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' })
      .text(' ID: ')
      .code(cellId, 'text');

    if (details) {
      if (details.content) {
        builder.text(' Content: ')
          .code(details.content.substring(0, 50) + (details.content.length > 50 ? '...' : ''), 'text');
      }
      if (details.type) {
        builder.text(' Type: ')
          .badge(details.type, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.position !== undefined) {
        builder.text(' Position: ')
          .badge(details.position.toString(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
    }

    this.info(builder);
  }

  /**
   * Log notebook lifecycle events
   */
  lifecycleEvent(event: 'create' | 'load' | 'save' | 'close' | 'delete', notebookId: string, details?: any): void {
    const eventColors = {
      'create': '#10B981',
      'load': '#3B82F6',
      'save': '#059669',
      'close': '#F59E0B',
      'delete': '#DC2626'
    };

    const builder = this.builder()
      .text('Notebook ')
      .badge(event.toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' })
      .text(' ID: ')
      .code(notebookId, 'text');

    if (details) {
      if (details.name) {
        builder.text(' Name: ')
          .badge(details.name, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.cellCount !== undefined) {
        builder.text(' Cells: ')
          .badge(details.cellCount.toString(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.duration !== undefined) {
        builder.text(' Duration: ')
          .badge(`${details.duration}ms`, { 
            backgroundColor: details.duration > 1000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
    }

    if (event === 'delete' || (event === 'save' && details?.error)) {
      this.warn(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log workflow execution
   */
  workflowExecution(stage: string, status: 'start' | 'progress' | 'complete' | 'error', details?: any): void {
    const statusColors = {
      'start': '#3B82F6',
      'progress': '#8B5CF6',
      'complete': '#10B981',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('Workflow ')
      .badge(status.toUpperCase(), { backgroundColor: statusColors[status], color: '#FFFFFF' })
      .text(' Stage: ')
      .code(stage, 'text');

    if (details) {
      if (details.step) {
        builder.text(' Step: ')
          .badge(details.step, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.progress !== undefined) {
        builder.text(' Progress: ')
          .badge(`${details.progress}%`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.error) {
        builder.text(' Error: ')
          .text(details.error);
      }
    }

    if (status === 'error') {
      this.error(builder);
    } else if (status === 'complete') {
      this.info(builder);
    } else {
      this.debug(builder);
    }
  }

  /**
   * Log task management
   */
  taskManagement(action: 'parse' | 'execute' | 'complete' | 'skip', taskInfo: string, details?: any): void {
    const actionColors = {
      'parse': '#3B82F6',
      'execute': '#8B5CF6',
      'complete': '#10B981',
      'skip': '#6B7280'
    };

    const builder = this.builder()
      .text('Task ')
      .badge(action.toUpperCase(), { backgroundColor: actionColors[action], color: '#FFFFFF' })
      .text(' Info: ')
      .text(taskInfo);

    if (details) {
      if (details.count !== undefined) {
        builder.text(' Count: ')
          .badge(details.count.toString(), { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.reason) {
        builder.text(' Reason: ')
          .text(details.reason);
      }
    }

    this.debug(builder);
  }

  /**
   * Log code execution
   */
  codeExecution(cellId: string, status: 'start' | 'success' | 'error', details?: any): void {
    const statusColors = {
      'start': '#3B82F6',
      'success': '#10B981',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('Code Execution ')
      .badge(status.toUpperCase(), { backgroundColor: statusColors[status], color: '#FFFFFF' })
      .text(' Cell: ')
      .code(cellId, 'text');

    if (details) {
      if (details.duration !== undefined) {
        builder.text(' Duration: ')
          .badge(`${details.duration}ms`, { 
            backgroundColor: details.duration > 5000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.outputLength !== undefined) {
        builder.text(' Output: ')
          .badge(`${details.outputLength} chars`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.error) {
        builder.text(' Error: ')
          .text(details.error);
      }
    }

    if (status === 'error') {
      this.error(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log cell type conversion
   */
  cellTypeConversion(cellId: string, fromType: string, toType: string, success: boolean): void {
    this.info(
      this.builder()
        .text('Cell Type Conversion ')
        .code(cellId, 'text')
        .text(' ')
        .badge(fromType, { backgroundColor: '#6B7280', color: '#FFFFFF' })
        .text(' → ')
        .badge(toType, { backgroundColor: '#3B82F6', color: '#FFFFFF' })
        .text(' ')
        .badge(success ? 'SUCCESS' : 'FAILED', { 
          backgroundColor: success ? '#10B981' : '#DC2626', 
          color: '#FFFFFF' 
        })
    );
  }

  /**
   * Log notebook validation
   */
  validation(type: 'cell' | 'notebook' | 'content', target: string, isValid: boolean, issues?: string[]): void {
    const builder = this.builder()
      .text('Validation ')
      .badge(type.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' Target: ')
      .code(target, 'text')
      .text(' Result: ')
      .badge(isValid ? 'VALID' : 'INVALID', { 
        backgroundColor: isValid ? '#10B981' : '#F59E0B', 
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
   * Log cell content processing
   */
  contentProcessing(operation: 'parse' | 'format' | 'validate' | 'transform', cellId: string, details?: any): void {
    const operationColors = {
      'parse': '#3B82F6',
      'format': '#8B5CF6',
      'validate': '#F59E0B',
      'transform': '#10B981'
    };

    const builder = this.builder()
      .text('Content Processing ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' })
      .text(' Cell: ')
      .code(cellId, 'text');

    if (details) {
      if (details.inputLength !== undefined) {
        builder.text(' Input: ')
          .badge(`${details.inputLength} chars`, { backgroundColor: '#6B7280', color: '#FFFFFF' });
      }
      if (details.outputLength !== undefined) {
        builder.text(' Output: ')
          .badge(`${details.outputLength} chars`, { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
      }
      if (details.changes !== undefined) {
        builder.text(' Changes: ')
          .badge(details.changes.toString(), { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
    }

    this.debug(builder);
  }

  /**
   * Log notebook state changes
   */
  stateChange(property: string, oldValue: any, newValue: any, context?: string): void {
    const builder = this.builder()
      .text('State Change ')
      .badge(property, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });

    if (context) {
      builder.text(' Context: ')
        .badge(context, { backgroundColor: '#6B7280', color: '#FFFFFF' });
    }

    builder.newLine()
      .text('Old: ')
      .code(JSON.stringify(oldValue), 'json')
      .newLine()
      .text('New: ')
      .code(JSON.stringify(newValue), 'json');

    this.debug(builder);
  }

  /**
   * Alias for lifecycleEvent to maintain consistency
   */
  notebookLifecycle(event: 'create' | 'load' | 'save' | 'close' | 'delete', notebookId: string, details?: any): void {
    this.lifecycleEvent(event, notebookId, details);
  }
}