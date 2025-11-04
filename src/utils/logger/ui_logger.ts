import { Logger, LogLevel, LoggerConfig } from './base_logger';

/**
 * UI-related logger class
 * Used for logging component lifecycle, user interactions, rendering performance, etc.
 */
export class UILogger extends Logger {
  constructor(config?: LoggerConfig) {
    super('UI', {
      level: LogLevel.DEBUG,
      enableTimestamp: true,
      enableColors: true,
      groupIcon: '🎨',
      customPrefix: '[UI]',
      ...config
    });
  }

  /**
   * Log component mount
   */
  componentMount(componentName: string, props?: Record<string, any>, renderTime?: number): void {
    const builder = this.builder()
      .text('Component Mount ')
      .badge(componentName, { backgroundColor: '#10B981', color: '#FFFFFF' });

    if (renderTime !== undefined) {
      builder.text(' Render time: ')
        .badge(`${renderTime}ms`, { 
          backgroundColor: renderTime > 50 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    if (props && Object.keys(props).length > 0) {
      builder.text(' Props: ')
        .code(JSON.stringify(props, null, 2), 'json');
    }

    this.debug(builder);
  }

  /**
   * Log component unmount
   */
  componentUnmount(componentName: string, cleanupTime?: number): void {
    const builder = this.builder()
      .text('Component Unmount ')
      .badge(componentName, { backgroundColor: '#DC2626', color: '#FFFFFF' });

    if (cleanupTime !== undefined) {
      builder.text(' Cleanup time: ')
        .badge(`${cleanupTime}ms`, { 
          backgroundColor: cleanupTime > 10 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    this.debug(builder);
  }

  /**
   * Log component update
   */
  componentUpdate(componentName: string, changedProps: string[], renderTime?: number): void {
    const builder = this.builder()
      .text('Component Update ')
      .badge(componentName, { backgroundColor: '#3B82F6', color: '#FFFFFF' })
      .text(' Changed props: ')
      .badge(changedProps.join(', '), { backgroundColor: '#6366F1', color: '#FFFFFF' });

    if (renderTime !== undefined) {
      builder.text(' Render time: ')
        .badge(`${renderTime}ms`, { 
          backgroundColor: renderTime > 50 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    this.debug(builder);
  }

  /**
   * Log user interaction
   */
  userInteraction(event: string, element: string, details?: Record<string, any>): void {
    const builder = this.builder()
      .text('User Interaction ')
      .badge(event.toUpperCase(), { backgroundColor: '#8B5CF6', color: '#FFFFFF' })
      .text(' Element: ')
      .code(element, 'text');

    if (details && Object.keys(details).length > 0) {
      builder.text(' Details: ')
        .code(JSON.stringify(details, null, 2), 'json');
    }

    this.info(builder);
  }

  /**
   * Log render performance warning
   */
  performanceWarning(componentName: string, issue: string, metrics: Record<string, number>): void {
    const builder = this.builder()
      .text('Performance Warning ')
      .badge(componentName, { backgroundColor: '#F59E0B', color: '#FFFFFF' })
      .text(' Issue: ')
      .text(issue)
      .newLine()
      .text('Metrics:');

    Object.entries(metrics).forEach(([key, value]) => {
      builder.newLine().text(`  ${key}: `)
        .badge(`${value}${key.includes('time') ? 'ms' : ''}`, { 
          backgroundColor: '#F59E0B', 
          color: '#FFFFFF' 
        });
    });

    this.warn(builder);
  }

  /**
   * Log state change
   */
  stateChange(context: string, oldValue: any, newValue: any, source?: string): void {
    const builder = this.builder()
      .text('State Change ')
      .badge(context, { backgroundColor: '#6366F1', color: '#FFFFFF' });

    if (source) {
      builder.text(' Source: ')
        .badge(source, { backgroundColor: '#9CA3AF', color: '#FFFFFF' });
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
   * Log route change
   */
  routeChange(from: string, to: string, duration?: number): void {
    const builder = this.builder()
      .text('Route Change ')
      .code(from, 'text')
      .text(' → ')
      .code(to, 'text');

    if (duration !== undefined) {
      builder.text(' Duration: ')
        .badge(`${duration}ms`, { 
          backgroundColor: duration > 500 ? '#F59E0B' : '#10B981', 
          color: '#FFFFFF' 
        });
    }

    this.info(builder);
  }

  /**
   * Log navigation events
   */
  navigation(route: string, details?: Record<string, any>): void {
    const builder = this.builder()
      .text('Navigation ')
      .badge(route.toUpperCase(), { backgroundColor: '#3B82F6', color: '#FFFFFF' });

    if (details) {
      if (details.notebookId) {
        builder.text(' Notebook: ')
          .code(details.notebookId, 'text');
      }
      if (details.from) {
        builder.text(' From: ')
          .code(details.from, 'text');
      }
      if (details.to) {
        builder.text(' To: ')
          .code(details.to, 'text');
      }
      if (details.duration !== undefined) {
        builder.text(' Duration: ')
          .badge(`${details.duration}ms`, { 
            backgroundColor: details.duration > 500 ? '#F59E0B' : '#10B981', 
            color: '#FFFFFF' 
          });
      }
      if (details.trigger) {
        builder.text(' Trigger: ')
          .text(details.trigger);
      }
    }

    this.info(builder);
  }

  /**
   * Log modal or dialog operations
   */
  modal(action: 'open' | 'close', modalId: string, trigger?: string): void {
    const actionColor = action === 'open' ? '#10B981' : '#DC2626';
    const builder = this.builder()
      .text('Modal ')
      .badge(action.toUpperCase(), { backgroundColor: actionColor, color: '#FFFFFF' })
      .text(' ID: ')
      .code(modalId, 'text');

    if (trigger) {
      builder.text(' Trigger: ')
        .text(trigger);
    }

    this.info(builder);
  }

  /**
   * Log form operations
   */
  form(action: 'submit' | 'validate' | 'reset', formId: string, result?: 'success' | 'error', errors?: string[]): void {
    const actionColors = {
      'submit': '#3B82F6',
      'validate': '#F59E0B',
      'reset': '#6B7280'
    };

    const builder = this.builder()
      .text('Form ')
      .badge(action.toUpperCase(), { backgroundColor: actionColors[action], color: '#FFFFFF' })
      .text(' ID: ')
      .code(formId, 'text');

    if (result) {
      builder.text(' Result: ')
        .badge(result.toUpperCase(), { 
          backgroundColor: result === 'success' ? '#10B981' : '#DC2626', 
          color: '#FFFFFF' 
        });
    }

    if (errors && errors.length > 0) {
      builder.text(' Errors: ')
        .code(JSON.stringify(errors), 'json');
    }

    if (result === 'error') {
      this.error(builder);
    } else {
      this.info(builder);
    }
  }

  /**
   * Log animation or transition
   */
  animation(type: 'start' | 'end', animationName: string, duration?: number, element?: string): void {
    const typeColor = type === 'start' ? '#10B981' : '#3B82F6';
    const builder = this.builder()
      .text('Animation ')
      .badge(type.toUpperCase(), { backgroundColor: typeColor, color: '#FFFFFF' })
      .text(' Name: ')
      .code(animationName, 'text');

    if (element) {
      builder.text(' Element: ')
        .code(element, 'text');
    }

    if (duration !== undefined) {
      builder.text(' Duration: ')
        .badge(`${duration}ms`, { backgroundColor: '#8B5CF6', color: '#FFFFFF' });
    }

    this.debug(builder);
  }

  /**
   * Log accessibility events
   */
  accessibility(event: string, element: string, details?: Record<string, any>): void {
    const builder = this.builder()
      .text('Accessibility ')
      .badge(event.toUpperCase(), { backgroundColor: '#059669', color: '#FFFFFF' })
      .text(' Element: ')
      .code(element, 'text');

    if (details && Object.keys(details).length > 0) {
      builder.text(' Details: ')
        .code(JSON.stringify(details, null, 2), 'json');
    }

    this.info(builder);
  }

  /**
   * Log responsive design changes
   */
  responsive(breakpoint: string, direction: 'up' | 'down', viewport: { width: number; height: number }): void {
    this.debug(
      this.builder()
        .text('Responsive Change ')
        .badge(breakpoint.toUpperCase(), { backgroundColor: '#6366F1', color: '#FFFFFF' })
        .text(' Direction: ')
        .badge(direction.toUpperCase(), { 
          backgroundColor: direction === 'up' ? '#10B981' : '#F59E0B', 
          color: '#FFFFFF' 
        })
        .text(' Viewport: ')
        .code(`${viewport.width}x${viewport.height}`, 'text')
    );
  }
}