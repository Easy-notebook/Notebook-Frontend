import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * Store-related logger class
 * Used for logging state management operations, store updates, data flow, etc.
 */
export class StoreLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('Store', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '🏪',
      customPrefix: '[STORE]',
      ...config
    });
  }

  /**
   * Log store initialization
   */
  storeInit(storeName: string, initialState?: any): void {
    const builder = this.builder()
      .text('Store Init ')
      .badge(storeName, { backgroundColor: '#10B981', color: '#FFFFFF' });

    if (initialState) {
      builder.text(' Initial State: ')
        .code(JSON.stringify(initialState, null, 2), 'json');
    }

    this.info(builder);
  }

  /**
   * Log action dispatch
   */
  actionDispatch(storeName: string, actionName: string, payload?: any, timestamp?: number): void {
    const builder = this.builder()
      .text('Action ')
      .badge(storeName, { backgroundColor: '#3B82F6', color: '#FFFFFF' })
      .text(' ')
      .badge(actionName, { backgroundColor: '#6366F1', color: '#FFFFFF' });

    if (payload) {
      builder.text(' Payload: ')
        .code(JSON.stringify(payload, null, 2), 'json');
    }

    if (timestamp) {
      builder.text(' Time: ')
        .badge(`${timestamp}ms`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }

    this.debug(builder);
  }

  /**
   * Log state mutation
   */
  stateMutation(storeName: string, property: string, oldValue: any, newValue: any, mutationPath?: string): void {
    const builder = this.builder()
      .text('State Mutation ')
      .badge(storeName, { backgroundColor: '#8B5CF6', color: '#FFFFFF' })
      .text(' Property: ')
      .code(property, 'text');

    if (mutationPath) {
      builder.text(' Path: ')
        .code(mutationPath, 'text');
    }

    builder.newLine()
      .text('Before: ')
      .code(JSON.stringify(oldValue), 'json')
      .newLine()
      .text('After: ')
      .code(JSON.stringify(newValue), 'json');

    this.debug(builder);
  }

  /**
   * Log computed property evaluation
   */
  computedEvaluation(storeName: string, computedName: string, dependencies: string[], result: any, evaluationTime?: number): void {
    const builder = this.builder()
      .text('Computed ')
      .badge(storeName, { backgroundColor: '#F59E0B', color: '#FFFFFF' })
      .text(' ')
      .badge(computedName, { backgroundColor: '#DC2626', color: '#FFFFFF' })
      .text(' Deps: ')
      .badge(dependencies.join(', '), { backgroundColor: '#6B7280', color: '#FFFFFF' });

    if (evaluationTime !== undefined) {
      builder.text(' Time: ')
        .badge(`${evaluationTime}ms`, { 
          backgroundColor: evaluationTime > 10 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    builder.text(' Result: ')
      .code(JSON.stringify(result), 'json');

    this.debug(builder);
  }

  /**
   * Log async action execution
   */
  asyncAction(storeName: string, actionName: string, status: 'start' | 'success' | 'error', details?: any): void {
    const statusColors = {
      'start': '#3B82F6',
      'success': '#10B981',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('Async Action ')
      .badge(storeName, { backgroundColor: '#8B5CF6', color: '#FFFFFF' })
      .text(' ')
      .badge(actionName, { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' ')
      .badge(status.toUpperCase(), { backgroundColor: statusColors[status], color: '#FFFFFF' });

    if (details) {
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
      if (details.result) {
        builder.text(' Result: ')
          .code(JSON.stringify(details.result), 'json');
      }
    }

    if (status === 'error') {
      this.error(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log store subscription events
   */
  subscription(storeName: string, event: 'subscribe' | 'unsubscribe' | 'notify', subscriberInfo?: string): void {
    const eventColors = {
      'subscribe': '#10B981',
      'unsubscribe': '#F59E0B',
      'notify': '#3B82F6'
    };

    const builder = this.builder()
      .text('Subscription ')
      .badge(storeName, { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' ')
      .badge(event.toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' });

    if (subscriberInfo) {
      builder.text(' Subscriber: ')
        .code(subscriberInfo, 'text');
    }

    this.debug(builder);
  }

  /**
   * Log store hydration/persistence
   */
  persistence(storeName: string, operation: 'save' | 'load' | 'clear', details?: any): void {
    const operationColors = {
      'save': '#10B981',
      'load': '#3B82F6',
      'clear': '#DC2626'
    };

    const builder = this.builder()
      .text('Persistence ')
      .badge(storeName, { backgroundColor: '#8B5CF6', color: '#FFFFFF' })
      .text(' ')
      .badge(operation.toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' });

    if (details) {
      if (details.size !== undefined) {
        builder.text(' Size: ')
          .badge(`${(details.size / 1024).toFixed(2)}KB`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.key) {
        builder.text(' Key: ')
          .code(details.key, 'text');
      }
      if (details.success !== undefined) {
        builder.text(' Status: ')
          .badge(details.success ? 'SUCCESS' : 'FAILED', { 
            backgroundColor: details.success ? '#10B981' : '#DC2626', 
            color: '#FFFFFF' 
          });
      }
    }

    this.info(builder);
  }

  /**
   * Log middleware execution
   */
  middleware(middlewareName: string, storeName: string, actionName: string, executionTime?: number): void {
    const builder = this.builder()
      .text('Middleware ')
      .badge(middlewareName, { backgroundColor: '#F59E0B', color: '#FFFFFF' })
      .text(' Store: ')
      .badge(storeName, { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' Action: ')
      .badge(actionName, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });

    if (executionTime !== undefined) {
      builder.text(' Time: ')
        .badge(`${executionTime}ms`, { 
          backgroundColor: executionTime > 5 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    this.debug(builder);
  }

  /**
   * Log store errors
   */
  storeError(storeName: string, operation: string, error: Error, context?: any): void {
    const builder = this.builder()
      .text('Store Error ')
      .badge(storeName, { backgroundColor: '#DC2626', color: '#FFFFFF' })
      .text(' Operation: ')
      .badge(operation, { backgroundColor: '#DC2626', color: '#FFFFFF' })
      .text(' Error: ')
      .text(error.message);

    if (context) {
      builder.text(' Context: ')
        .code(JSON.stringify(context, null, 2), 'json');
    }

    this.error(builder);
  }

  /**
   * Log state validation
   */
  stateValidation(storeName: string, property: string, isValid: boolean, validationRules?: string[], errors?: string[]): void {
    const builder = this.builder()
      .text('State Validation ')
      .badge(storeName, { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' Property: ')
      .code(property, 'text')
      .text(' Result: ')
      .badge(isValid ? 'VALID' : 'INVALID', { 
        backgroundColor: isValid ? '#10B981' : '#DC2626', 
        color: '#FFFFFF' 
      });

    if (validationRules && validationRules.length > 0) {
      builder.text(' Rules: ')
        .badge(validationRules.join(', '), { backgroundColor: '#6B7280', color: '#FFFFFF' });
    }

    if (errors && errors.length > 0) {
      builder.text(' Errors: ')
        .code(errors.join(', '), 'text');
    }

    if (isValid) {
      this.debug(builder);
    } else {
      this.warn(builder);
    }
  }

  /**
   * Log performance metrics
   */
  performance(storeName: string, operation: string, metrics: {
    duration: number;
    memoryUsage?: number;
    stateSize?: number;
    updateCount?: number;
  }): void {
    const { duration, memoryUsage, stateSize, updateCount } = metrics;

    const builder = this.builder()
      .text('Performance ')
      .badge(storeName, { backgroundColor: '#8B5CF6', color: '#FFFFFF' })
      .text(' Operation: ')
      .badge(operation, { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' Duration: ')
      .badge(`${duration}ms`, { 
        backgroundColor: duration > 50 ? '#F59E0B' : '#10B981', 
        color: '#FFFFFF' 
      });

    if (memoryUsage !== undefined) {
      builder.text(' Memory: ')
        .badge(`${(memoryUsage / 1024).toFixed(2)}KB`, { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
    }

    if (stateSize !== undefined) {
      builder.text(' State Size: ')
        .badge(`${(stateSize / 1024).toFixed(2)}KB`, { backgroundColor: '#6B7280', color: '#FFFFFF' });
    }

    if (updateCount !== undefined) {
      builder.text(' Updates: ')
        .badge(updateCount.toString(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }

    this.debug(builder);
  }
}