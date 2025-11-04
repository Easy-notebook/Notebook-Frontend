import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * Network-related logger class
 * Used for logging network status, WebSocket connections, SSE events, etc.
 */
export class NetworkLogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('Network', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '🔌',
      customPrefix: '[NETWORK]',
      ...config
    });
  }

  /**
   * Log network status change
   */
  statusChange(online: boolean, connectionType?: string, effectiveType?: string): void {
    const builder = this.builder()
      .text('Network Status ')
      .badge(online ? 'ONLINE' : 'OFFLINE', { 
        backgroundColor: online ? '#10B981' : '#DC2626', 
        color: '#FFFFFF' 
      });

    if (connectionType) {
      builder.text(' Type: ')
        .badge(connectionType.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' });
    }

    if (effectiveType) {
      builder.text(' Speed: ')
        .badge(effectiveType.toUpperCase(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }

    if (online) {
      this.info(builder);
    } else {
      this.warn(builder);
    }
  }

  /**
   * Log WebSocket connection events
   */
  websocket(event: 'connect' | 'disconnect' | 'error' | 'message' | 'reconnect', url: string, details?: any): void {
    const eventColors = {
      'connect': '#10B981',
      'disconnect': '#F59E0B',
      'error': '#DC2626',
      'message': '#3B82F6',
      'reconnect': '#8B5CF6'
    };

    const builder = this.builder()
      .text('WebSocket ')
      .badge(event.toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' })
      .text(' URL: ')
      .code(url, 'text');

    if (details) {
      if (event === 'message') {
        builder.text(' Data: ')
          .code(typeof details === 'string' ? details : JSON.stringify(details), 'json');
      } else if (event === 'error') {
        builder.text(' Error: ')
          .text(details.message || details);
      } else if (event === 'reconnect') {
        builder.text(' Attempt: ')
          .badge(`#${details.attempt}`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
      }
    }

    if (event === 'error') {
      this.error(builder);
    } else if (event === 'disconnect') {
      this.warn(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log Server-Sent Events
   */
  sse(event: 'connect' | 'disconnect' | 'message' | 'error', url: string, data?: any): void {
    const eventColors = {
      'connect': '#10B981',
      'disconnect': '#F59E0B',
      'message': '#3B82F6',
      'error': '#DC2626'
    };

    const builder = this.builder()
      .text('SSE ')
      .badge(event.toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' })
      .text(' URL: ')
      .code(url, 'text');

    if (data) {
      if (event === 'message') {
        builder.text(' Event: ')
          .badge(data.type || 'message', { backgroundColor: '#6366F1', color: '#FFFFFF' })
          .text(' Data: ')
          .code(data.data || data, 'text');
      } else if (event === 'error') {
        builder.text(' Error: ')
          .text(data.message || data);
      }
    }

    if (event === 'error') {
      this.error(builder);
    } else if (event === 'disconnect') {
      this.warn(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log connection latency
   */
  latency(target: string, latency: number, type: 'ping' | 'api' | 'websocket' = 'ping'): void {
    const latencyColor = latency > 500 ? '#DC2626' : latency > 200 ? '#F59E0B' : '#10B981';
    
    this.info(
      this.builder()
        .text('Latency ')
        .badge(type.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' })
        .text(' Target: ')
        .code(target, 'text')
        .text(' Latency: ')
        .badge(`${latency}ms`, { backgroundColor: latencyColor, color: '#FFFFFF' })
    );
  }

  /**
   * Log bandwidth measurement
   */
  bandwidth(downloadSpeed: number, uploadSpeed?: number, unit: 'kbps' | 'mbps' = 'mbps'): void {
    const getSpeedColor = (speed: number) => {
      if (unit === 'mbps') {
        return speed > 10 ? '#10B981' : speed > 1 ? '#F59E0B' : '#DC2626';
      } else {
        return speed > 1000 ? '#10B981' : speed > 100 ? '#F59E0B' : '#DC2626';
      }
    };

    const builder = this.builder()
      .text('Bandwidth ')
      .text('Download: ')
      .badge(`${downloadSpeed}${unit}`, { 
        backgroundColor: getSpeedColor(downloadSpeed), 
        color: '#FFFFFF' 
      });

    if (uploadSpeed !== undefined) {
      builder.text(' Upload: ')
        .badge(`${uploadSpeed}${unit}`, { 
          backgroundColor: getSpeedColor(uploadSpeed), 
          color: '#FFFFFF' 
        });
    }

    this.info(builder);
  }

  /**
   * Log DNS resolution
   */
  dns(domain: string, resolvedIp: string, resolutionTime: number): void {
    this.debug(
      this.builder()
        .text('DNS Resolution ')
        .text('Domain: ')
        .code(domain, 'text')
        .text(' IP: ')
        .badge(resolvedIp, { backgroundColor: '#3B82F6', color: '#FFFFFF' })
        .text(' Time: ')
        .badge(`${resolutionTime}ms`, { 
          backgroundColor: resolutionTime > 100 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        })
    );
  }

  /**
   * Log connection pool status
   */
  connectionPool(poolName: string, active: number, idle: number, max: number): void {
    const utilizationPercent = ((active + idle) / max) * 100;
    const utilizationColor = utilizationPercent > 80 ? '#DC2626' : utilizationPercent > 60 ? '#F59E0B' : '#10B981';

    this.debug(
      this.builder()
        .text('Connection Pool ')
        .badge(poolName, { backgroundColor: '#6366F1', color: '#FFFFFF' })
        .text(' Active: ')
        .badge(active.toString(), { backgroundColor: '#10B981', color: '#FFFFFF' })
        .text(' Idle: ')
        .badge(idle.toString(), { backgroundColor: '#6B7280', color: '#FFFFFF' })
        .text(' Max: ')
        .badge(max.toString(), { backgroundColor: '#9CA3AF', color: '#FFFFFF' })
        .text(' Utilization: ')
        .badge(`${utilizationPercent.toFixed(1)}%`, { 
          backgroundColor: utilizationColor, 
          color: '#FFFFFF' 
        })
    );
  }

  /**
   * Log proxy or CDN cache status
   */
  cache(url: string, status: 'hit' | 'miss' | 'stale', edge?: string, age?: number): void {
    const statusColors = {
      'hit': '#10B981',
      'miss': '#F59E0B',
      'stale': '#DC2626'
    };

    const builder = this.builder()
      .text('Cache ')
      .badge(status.toUpperCase(), { backgroundColor: statusColors[status], color: '#FFFFFF' })
      .text(' URL: ')
      .code(url, 'text');

    if (edge) {
      builder.text(' Edge: ')
        .badge(edge, { backgroundColor: '#6366F1', color: '#FFFFFF' });
    }

    if (age !== undefined) {
      builder.text(' Age: ')
        .badge(`${age}s`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }

    this.debug(builder);
  }

  /**
   * Log network security events
   */
  security(event: 'ssl_error' | 'cert_invalid' | 'mixed_content' | 'csp_violation', details: string, url?: string): void {
    const builder = this.builder()
      .text('Security ')
      .badge(event.replace('_', ' ').toUpperCase(), { backgroundColor: '#DC2626', color: '#FFFFFF' })
      .text(' Details: ')
      .text(details);

    if (url) {
      builder.text(' URL: ')
        .code(url, 'text');
    }

    this.error(builder);
  }

  /**
   * Log network throttling
   */
  throttling(enabled: boolean, downloadKbps?: number, uploadKbps?: number, latencyMs?: number): void {
    const builder = this.builder()
      .text('Network Throttling ')
      .badge(enabled ? 'ENABLED' : 'DISABLED', { 
        backgroundColor: enabled ? '#F59E0B' : '#10B981', 
        color: '#FFFFFF' 
      });

    if (enabled && downloadKbps !== undefined) {
      builder.text(' Download: ')
        .badge(`${downloadKbps}kbps`, { backgroundColor: '#DC2626', color: '#FFFFFF' });
    }

    if (enabled && uploadKbps !== undefined) {
      builder.text(' Upload: ')
        .badge(`${uploadKbps}kbps`, { backgroundColor: '#DC2626', color: '#FFFFFF' });
    }

    if (enabled && latencyMs !== undefined) {
      builder.text(' Latency: ')
        .badge(`+${latencyMs}ms`, { backgroundColor: '#DC2626', color: '#FFFFFF' });
    }

    this.warn(builder);
  }

  /**
   * Log service worker network events
   */
  serviceWorker(event: 'install' | 'activate' | 'fetch' | 'sync' | 'push', url?: string, details?: any): void {
    const eventColors = {
      'install': '#10B981',
      'activate': '#3B82F6',
      'fetch': '#6366F1',
      'sync': '#8B5CF6',
      'push': '#F59E0B'
    };

    const builder = this.builder()
      .text('Service Worker ')
      .badge(event.toUpperCase(), { backgroundColor: eventColors[event], color: '#FFFFFF' });

    if (url) {
      builder.text(' URL: ')
        .code(url, 'text');
    }

    if (details) {
      builder.text(' Details: ')
        .code(typeof details === 'string' ? details : JSON.stringify(details), 'json');
    }

    this.info(builder);
  }
}