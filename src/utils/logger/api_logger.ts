import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * API-related logger class
 * Used for logging HTTP requests, responses, API errors, and performance metrics
 */
export class ApiLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('API', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '🌐',
      customPrefix: '[API]',
      ...config
    });
  }

  /**
   * Log HTTP request
   */
  request(method: string, url: string, headers?: Record<string, string>, body?: any): void {
    const builder = this.builder()
      .text('Request ')
      .badge(method.toUpperCase(), { 
        backgroundColor: this.getMethodColor(method), 
        color: '#FFFFFF',
        fontWeight: 'bold'
      })
      .text(' ')
      .code(url, 'text');

    if (headers && Object.keys(headers).length > 0) {
      builder.text(' Headers: ')
        .code(JSON.stringify(headers, null, 2), 'json');
    }

    if (body) {
      builder.text(' Body: ')
        .code(typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'json');
    }

    this.info(builder);
  }

  /**
   * Log HTTP response
   */
  response(method: string, url: string, status: number, duration?: number, size?: number): void {
    const statusColor = this.getStatusColor(status);
    const builder = this.builder()
      .text('Response ')
      .badge(method.toUpperCase(), { 
        backgroundColor: this.getMethodColor(method), 
        color: '#FFFFFF' 
      })
      .text(' ')
      .code(url, 'text')
      .text(' Status: ')
      .badge(status.toString(), { 
        backgroundColor: statusColor, 
        color: '#FFFFFF' 
      });

    if (duration !== undefined) {
      builder.text(' Duration: ')
        .badge(`${duration}ms`, { 
          backgroundColor: duration > 1000 ? '#DC2626' : duration > 500 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    if (size !== undefined) {
      builder.text(' Size: ')
        .badge(`${(size / 1024).toFixed(2)}KB`, { 
          backgroundColor: '#6366F1', 
          color: '#FFFFFF' 
        });
    }

    if (status >= 400) {
      this.error(builder);
    } else if (status >= 300) {
      this.warn(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log API error
   */
  apiError(method: string, url: string, error: Error, status?: number): void {
    this.error(
      this.builder()
        .text('API Error ')
        .badge(method.toUpperCase(), { backgroundColor: '#DC2626', color: '#FFFFFF' })
        .text(' ')
        .code(url, 'text')
        .text(' Status: ')
        .badge((status || 'Unknown').toString(), { backgroundColor: '#DC2626', color: '#FFFFFF' })
        .text(' Message: ')
        .text(error.message)
    );
  }

  /**
   * Log request timeout
   */
  timeout(method: string, url: string, timeoutMs: number): void {
    this.warn(
      this.builder()
        .text('Request Timeout ')
        .badge(method.toUpperCase(), { backgroundColor: '#F59E0B', color: '#FFFFFF' })
        .text(' ')
        .code(url, 'text')
        .text(' Timeout: ')
        .badge(`${timeoutMs}ms`, { backgroundColor: '#F59E0B', color: '#FFFFFF' })
    );
  }

  /**
   * Log retry attempt
   */
  retry(method: string, url: string, attempt: number, maxAttempts: number): void {
    this.warn(
      this.builder()
        .text('Retry Attempt ')
        .badge(method.toUpperCase(), { backgroundColor: '#F59E0B', color: '#FFFFFF' })
        .text(' ')
        .code(url, 'text')
        .text(' Attempt: ')
        .badge(`${attempt}/${maxAttempts}`, { backgroundColor: '#F59E0B', color: '#FFFFFF' })
    );
  }

  /**
   * Log rate limit hit
   */
  rateLimit(method: string, url: string, resetTime?: number): void {
    const builder = this.builder()
      .text('Rate Limit Hit ')
      .badge(method.toUpperCase(), { backgroundColor: '#DC2626', color: '#FFFFFF' })
      .text(' ')
      .code(url, 'text');

    if (resetTime) {
      builder.text(' Reset: ')
        .badge(`${resetTime}s`, { backgroundColor: '#DC2626', color: '#FFFFFF' });
    }

    this.warn(builder);
  }

  /**
   * Log authentication failure
   */
  authFailure(method: string, url: string, reason?: string): void {
    const builder = this.builder()
      .text('Auth Failure ')
      .badge(method.toUpperCase(), { backgroundColor: '#DC2626', color: '#FFFFFF' })
      .text(' ')
      .code(url, 'text');

    if (reason) {
      builder.text(' Reason: ')
        .text(reason);
    }

    this.error(builder);
  }

  /**
   * Log request performance metrics
   */
  performance(metrics: {
    method: string;
    url: string;
    dns?: number;
    connect?: number;
    request?: number;
    response?: number;
    total: number;
  }): void {
    const { method, url, dns, connect, request, response, total } = metrics;
    
    const builder = this.builder()
      .text('Performance ')
      .badge(method.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' })
      .text(' ')
      .code(url, 'text')
      .newLine()
      .text('Timing breakdown:');

    if (dns !== undefined) {
      builder.newLine().text('  DNS: ').badge(`${dns}ms`, { backgroundColor: '#10B981', color: '#FFFFFF' });
    }
    if (connect !== undefined) {
      builder.newLine().text('  Connect: ').badge(`${connect}ms`, { backgroundColor: '#3B82F6', color: '#FFFFFF' });
    }
    if (request !== undefined) {
      builder.newLine().text('  Request: ').badge(`${request}ms`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }
    if (response !== undefined) {
      builder.newLine().text('  Response: ').badge(`${response}ms`, { backgroundColor: '#F59E0B', color: '#FFFFFF' });
    }
    
    builder.newLine().text('  Total: ').badge(`${total}ms`, { 
      backgroundColor: total > 1000 ? '#DC2626' : total > 500 ? '#F59E0B' : '#10B981', 
      color: '#FFFFFF' 
    });

    this.debug(builder);
  }

  /**
   * Get color for HTTP method
   */
  private getMethodColor(method: string): string {
    const colors: Record<string, string> = {
      'GET': '#10B981',
      'POST': '#3B82F6',
      'PUT': '#F59E0B',
      'DELETE': '#DC2626',
      'PATCH': '#8B5CF6',
      'HEAD': '#6B7280',
      'OPTIONS': '#9CA3AF'
    };
    return colors[method.toUpperCase()] || '#6B7280';
  }

  /**
   * Get color for HTTP status code
   */
  private getStatusColor(status: number): string {
    if (status >= 500) return '#DC2626'; // Server Error - Red
    if (status >= 400) return '#F59E0B'; // Client Error - Orange
    if (status >= 300) return '#3B82F6'; // Redirection - Blue
    if (status >= 200) return '#10B981'; // Success - Green
    return '#6B7280'; // Informational - Gray
  }
}