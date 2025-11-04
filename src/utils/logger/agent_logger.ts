import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * AI Agent-related logger class
 * Used for logging AI agent operations, conversations, streaming responses, etc.
 */
export class AgentLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('Agent', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '🤖',
      customPrefix: '[AGENT]',
      ...config
    });
  }

  /**
   * Log agent initialization
   */
  agentInit(agentType: string, model: string, config?: any): void {
    const builder = this.builder()
      .text('Agent Init ')
      .badge(agentType, { backgroundColor: '#10B981', color: '#FFFFFF' })
      .text(' Model: ')
      .badge(model, { backgroundColor: '#3B82F6', color: '#FFFFFF' });

    if (config) {
      builder.text(' Config: ')
        .code(JSON.stringify(config, null, 2), 'json');
    }

    this.info(builder);
  }

  /**
   * Log conversation management
   */
  conversation(action: 'start' | 'continue' | 'end' | 'reset', conversationId: string, details?: any): void {
    const actionColors = {
      'start': '#10B981',
      'continue': '#3B82F6',
      'end': '#F59E0B',
      'reset': '#DC2626'
    };

    const builder = this.builder()
      .text('Conversation ')
      .badge(action.toUpperCase(), { backgroundColor: actionColors[action], color: '#FFFFFF' })
      .text(' ID: ')
      .code(conversationId, 'text');

    if (details) {
      if (details.messageCount !== undefined) {
        builder.text(' Messages: ')
          .badge(details.messageCount.toString(), { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.duration !== undefined) {
        builder.text(' Duration: ')
          .badge(`${details.duration}ms`, { 
            backgroundColor: details.duration > 5000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.reason) {
        builder.text(' Reason: ')
          .text(details.reason);
      }
    }

    this.info(builder);
  }

  /**
   * Log message processing
   */
  messageProcessing(type: 'user' | 'assistant' | 'system', messageId: string, content: string, details?: any): void {
    const typeColors = {
      'user': '#3B82F6',
      'assistant': '#10B981',
      'system': '#6B7280'
    };

    const builder = this.builder()
      .text('Message ')
      .badge(type.toUpperCase(), { backgroundColor: typeColors[type], color: '#FFFFFF' })
      .text(' ID: ')
      .code(messageId, 'text')
      .text(' Content: ')
      .code(content.substring(0, 100) + (content.length > 100 ? '...' : ''), 'text');

    if (details) {
      if (details.tokens !== undefined) {
        builder.text(' Tokens: ')
          .badge(details.tokens.toString(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.processingTime !== undefined) {
        builder.text(' Time: ')
          .badge(`${details.processingTime}ms`, { 
            backgroundColor: details.processingTime > 1000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
    }

    this.debug(builder);
  }

  /**
   * Log streaming operations
   */
  streaming(event: 'start' | 'chunk' | 'complete' | 'error' | 'abort', streamId: string, details?: any): void {
    const eventColors = {
      'start': '#3B82F6',
      'chunk': '#8B5CF6',
      'complete': '#10B981',
      'error': '#DC2626',
      'abort': '#F59E0B'
    };

    const builder = this.builder()
      .text('Streaming ')
      .badge(event.toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' })
      .text(' ID: ')
      .code(streamId, 'text');

    if (details) {
      if (details.chunkSize !== undefined) {
        builder.text(' Chunk: ')
          .badge(`${details.chunkSize} chars`, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.totalReceived !== undefined) {
        builder.text(' Total: ')
          .badge(`${details.totalReceived} chars`, { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
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

    if (event === 'error') {
      this.error(builder);
    } else if (event === 'abort') {
      this.warn(builder);
    } else {
      this.debug(builder);
    }
  }

  /**
   * Log agent responses
   */
  agentResponse(qaId: string, responseType: 'text' | 'json' | 'code' | 'error', content: string, details?: any): void {
    const typeColors = {
      'text': '#10B981',
      'json': '#3B82F6',
      'code': '#8B5CF6',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('Agent Response ')
      .badge(responseType.toUpperCase(), { backgroundColor: typeColors[responseType], color: '#FFFFFF' })
      .text(' QA ID: ')
      .code(qaId, 'text')
      .text(' Content: ')
      .code(content.substring(0, 100) + (content.length > 100 ? '...' : ''), responseType === 'json' ? 'json' : 'text');

    if (details) {
      if (details.responseTime !== undefined) {
        builder.text(' Time: ')
          .badge(`${details.responseTime}ms`, { 
            backgroundColor: details.responseTime > 5000 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.tokens !== undefined) {
        builder.text(' Tokens: ')
          .badge(details.tokens.toString(), { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
      if (details.model) {
        builder.text(' Model: ')
          .badge(details.model, { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
      }
    }

    if (responseType === 'error') {
      this.error(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log agent analysis operations
   */
  analysis(operation: 'data_structure' | 'feature_engineering' | 'model_selection' | 'evaluation', status: 'start' | 'progress' | 'complete' | 'error', details?: any): void {
    const operationColors = {
      'data_structure': '#3B82F6',
      'feature_engineering': '#8B5CF6',
      'model_selection': '#6366F1',
      'evaluation': '#059669'
    };

    const statusColors = {
      'start': '#3B82F6',
      'progress': '#8B5CF6',
      'complete': '#10B981',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('Analysis ')
      .badge(operation.replace('_', ' ').toUpperCase(), { backgroundColor: operationColors[operation], color: '#FFFFFF' })
      .text(' ')
      .badge(status.toUpperCase(), { backgroundColor: statusColors[status], color: '#FFFFFF' });

    if (details) {
      if (details.datasetSize !== undefined) {
        builder.text(' Dataset: ')
          .badge(`${details.datasetSize} rows`, { backgroundColor: '#6B7280', color: '#FFFFFF' });
      }
      if (details.features !== undefined) {
        builder.text(' Features: ')
          .badge(details.features.toString(), { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
      }
      if (details.progress !== undefined) {
        builder.text(' Progress: ')
          .badge(`${details.progress}%`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
      if (details.result) {
        builder.text(' Result: ')
          .code(JSON.stringify(details.result), 'json');
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
   * Log agent recommendations
   */
  recommendation(type: 'algorithm' | 'hyperparameter' | 'feature' | 'preprocessing', recommendation: any, confidence?: number): void {
    const typeColors = {
      'algorithm': '#10B981',
      'hyperparameter': '#3B82F6',
      'feature': '#8B5CF6',
      'preprocessing': '#F59E0B'
    };

    const builder = this.builder()
      .text('Recommendation ')
      .badge(type.toUpperCase(), { backgroundColor: typeColors[type], color: '#FFFFFF' });

    if (confidence !== undefined) {
      builder.text(' Confidence: ')
        .badge(`${(confidence * 100).toFixed(1)}%`, { 
          backgroundColor: confidence > 0.8 ? '#10B981' : confidence > 0.6 ? '#F59E0B' : '#DC2626', 
          color: '#FFFFFF' 
        });
    }

    builder.text(' Recommendation: ')
      .code(JSON.stringify(recommendation, null, 2), 'json');

    this.info(builder);
  }

  /**
   * Log agent performance metrics
   */
  performance(operation: string, metrics: {
    responseTime: number;
    tokenCount?: number;
    memoryUsage?: number;
    accuracy?: number;
    throughput?: number;
  }): void {
    const { responseTime, tokenCount, memoryUsage, accuracy, throughput } = metrics;

    const builder = this.builder()
      .text('Performance ')
      .badge(operation.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' Response Time: ')
      .badge(`${responseTime}ms`, { 
        backgroundColor: responseTime > 5000 ? '#DC2626' : responseTime > 2000 ? '#F59E0B' : '#10B981', 
        color: '#FFFFFF' 
      });

    if (tokenCount !== undefined) {
      builder.text(' Tokens: ')
        .badge(tokenCount.toString(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }

    if (memoryUsage !== undefined) {
      builder.text(' Memory: ')
        .badge(`${(memoryUsage / 1024).toFixed(2)}KB`, { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
    }

    if (accuracy !== undefined) {
      builder.text(' Accuracy: ')
        .badge(`${(accuracy * 100).toFixed(1)}%`, { 
          backgroundColor: accuracy > 0.9 ? '#10B981' : accuracy > 0.7 ? '#F59E0B' : '#DC2626', 
          color: '#FFFFFF' 
        });
    }

    if (throughput !== undefined) {
      builder.text(' Throughput: ')
        .badge(`${throughput} req/s`, { backgroundColor: '#6B7280', color: '#FFFFFF' });
    }

    this.debug(builder);
  }

  /**
   * Log agent errors and warnings
   */
  agentIssue(level: 'warning' | 'error', operation: string, message: string, context?: any): void {
    const builder = this.builder()
      .text('Agent Issue ')
      .badge(level.toUpperCase(), { 
        backgroundColor: level === 'error' ? '#DC2626' : '#F59E0B', 
        color: '#FFFFFF' 
      })
      .text(' Operation: ')
      .badge(operation, { backgroundColor: '#6B7280', color: '#FFFFFF' })
      .text(' Message: ')
      .text(message);

    if (context) {
      builder.text(' Context: ')
        .code(JSON.stringify(context, null, 2), 'json');
    }

    if (level === 'error') {
      this.error(builder);
    } else {
      this.warn(builder);
    }
  }

  /**
   * Log QA (Question-Answer) operations
   */
  qaOperation(action: 'create' | 'update' | 'delete' | 'find', qaId: string, details?: any): void {
    const actionColors = {
      'create': '#10B981',
      'update': '#3B82F6',
      'delete': '#DC2626',
      'find': '#8B5CF6'
    };

    const builder = this.builder()
      .text('QA ')
      .badge(action.toUpperCase(), { backgroundColor: actionColors[action], color: '#FFFFFF' })
      .text(' ID: ')
      .code(qaId, 'text');

    if (details) {
      if (details.question) {
        builder.text(' Question: ')
          .code(details.question.substring(0, 50) + (details.question.length > 50 ? '...' : ''), 'text');
      }
      if (details.status) {
        builder.text(' Status: ')
          .badge(details.status, { backgroundColor: '#6366F1', color: '#FFFFFF' });
      }
    }

    this.debug(builder);
  }
}