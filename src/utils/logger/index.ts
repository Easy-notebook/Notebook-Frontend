import { Logger, LogLevel, LoggerConfig, ThemeType } from './base_logger';
import { StorageLogger } from './storage_logger';
import { ApiLogger } from './api_logger';
import { UILogger } from './ui_logger';
import { NetworkLogger } from './network_logger';
import { NotebookLogger } from './notebook_logger';
import { StoreLogger } from './store_logger';
import { FileLogger } from './file_logger';
import { AgentLogger } from './agent_logger';

/**
 * Logger configuration for each logger type
 */
interface LoggerTypeConfig {
  enabled: boolean;
  level: LogLevel;
  config?: LoggerConfig;
}

/**
 * Global logger configurations
 */
interface GlobalLoggerConfig {
  storage: LoggerTypeConfig;
  api: LoggerTypeConfig;
  ui: LoggerTypeConfig;
  network: LoggerTypeConfig;
  notebook: LoggerTypeConfig;
  store: LoggerTypeConfig;
  file: LoggerTypeConfig;
  agent: LoggerTypeConfig;
  [key: string]: LoggerTypeConfig;
}

/**
 * Logger Manager Class
 * Provides centralized management for all logger instances
 */
class LoggerManager {
  private static instance: LoggerManager;
  private loggers: Map<string, Logger> = new Map();
  private config: GlobalLoggerConfig;

  private constructor() {
    // Default configuration
    this.config = {
      storage: {
        enabled: true,
        level: LogLevel.DEBUG
      },
      api: {
        enabled: true,
        level: LogLevel.INFO
      },
      ui: {
        enabled: true,
        level: LogLevel.DEBUG
      },
      network: {
        enabled: true,
        level: LogLevel.DEBUG
      },
      notebook: {
        enabled: true,
        level: LogLevel.INFO
      },
      store: {
        enabled: true,
        level: LogLevel.DEBUG
      },
      file: {
        enabled: true,
        level: LogLevel.INFO
      },
      agent: {
        enabled: true,
        level: LogLevel.INFO
      }
    };

    this.initializeLoggers();
  }

  public static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager();
    }
    return LoggerManager.instance;
  }

  /**
   * Initialize all logger instances
   */
  private initializeLoggers(): void {
    // Create all logger instances
    this.loggers.set('storage', new StorageLogger(this.config.storage.config));
    this.loggers.set('api', new ApiLogger(this.config.api.config));
    this.loggers.set('ui', new UILogger(this.config.ui.config));
    this.loggers.set('network', new NetworkLogger(this.config.network.config));
    this.loggers.set('notebook', new NotebookLogger(this.config.notebook.config));
    this.loggers.set('store', new StoreLogger(this.config.store.config));
    this.loggers.set('file', new FileLogger(this.config.file.config));
    this.loggers.set('agent', new AgentLogger(this.config.agent.config));

    // Set initial enabled states
    this.updateLoggerStates();
  }

  /**
   * Update logger enabled states based on configuration
   */
  private updateLoggerStates(): void {
    const groupStates: Record<string, boolean> = {};
    
    Object.entries(this.config).forEach(([key, config]) => {
      groupStates[this.getGroupName(key)] = config.enabled;
    });

    Logger.setGroupsEnabled(groupStates);
  }

  /**
   * Get group name for logger type
   */
  private getGroupName(loggerType: string): string {
    const groupNames: Record<string, string> = {
      'storage': 'Storage',
      'api': 'API',
      'ui': 'UI',
      'network': 'Network',
      'notebook': 'Notebook',
      'store': 'Store',
      'file': 'File',
      'agent': 'Agent'
    };
    return groupNames[loggerType] || loggerType;
  }

  /**
   * Configure a specific logger type
   */
  public configureLogger(loggerType: string, config: Partial<LoggerTypeConfig>): void {
    if (this.config[loggerType]) {
      this.config[loggerType] = {
        ...this.config[loggerType],
        ...config
      };
      this.updateLoggerStates();
    }
  }

  /**
   * Configure multiple logger types at once
   */
  public configureLoggers(configs: Partial<GlobalLoggerConfig>): void {
    Object.entries(configs).forEach(([loggerType, config]) => {
      if (this.config[loggerType] && config) {
        this.config[loggerType] = {
          ...this.config[loggerType],
          ...config
        };
      }
    });
    this.updateLoggerStates();
  }

  /**
   * Enable or disable a logger type
   */
  public setLoggerEnabled(loggerType: string, enabled: boolean): void {
    this.configureLogger(loggerType, { enabled });
  }

  /**
   * Set log level for a specific logger type
   */
  public setLoggerLevel(loggerType: string, level: LogLevel): void {
    this.configureLogger(loggerType, { level });
  }

  /**
   * Set global log level for all loggers
   */
  public setGlobalLevel(level: LogLevel): void {
    Logger.setGlobalLevel(level);
  }

  /**
   * Set theme for all loggers
   */
  public setTheme(theme: ThemeType): void {
    Logger.setTheme(theme);
  }

  /**
   * Get a logger instance by type
   */
  public getLogger(loggerType: string): Logger | undefined {
    return this.loggers.get(loggerType);
  }

  /**
   * Create a custom logger
   */
  public createCustomLogger(name: string, config?: LoggerConfig): Logger {
    const logger = new Logger(name, config);
    this.loggers.set(name, logger);
    
    // Add to configuration
    this.config[name] = {
      enabled: true,
      level: config?.level || LogLevel.DEBUG,
      config
    };
    
    return logger;
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): GlobalLoggerConfig {
    return { ...this.config };
  }

  /**
   * Reset all loggers to default configuration
   */
  public reset(): void {
    this.config = {
      storage: { enabled: true, level: LogLevel.DEBUG },
      api: { enabled: true, level: LogLevel.INFO },
      ui: { enabled: true, level: LogLevel.DEBUG },
      network: { enabled: true, level: LogLevel.DEBUG },
      notebook: { enabled: true, level: LogLevel.INFO },
      store: { enabled: true, level: LogLevel.DEBUG },
      file: { enabled: true, level: LogLevel.INFO },
      agent: { enabled: true, level: LogLevel.INFO }
    };
    this.updateLoggerStates();
  }

  /**
   * Disable all loggers
   */
  public disableAll(): void {
    Object.keys(this.config).forEach(key => {
      this.config[key].enabled = false;
    });
    this.updateLoggerStates();
  }

  /**
   * Enable all loggers
   */
  public enableAll(): void {
    Object.keys(this.config).forEach(key => {
      this.config[key].enabled = true;
    });
    this.updateLoggerStates();
  }
}

// Get the singleton instance
const loggerManager = LoggerManager.getInstance();

// Export logger instances for direct use
export const storageLog = loggerManager.getLogger('storage') as StorageLogger;
export const apiLog = loggerManager.getLogger('api') as ApiLogger;
export const uiLog = loggerManager.getLogger('ui') as UILogger;
export const networkLog = loggerManager.getLogger('network') as NetworkLogger;
export const notebookLog = loggerManager.getLogger('notebook') as NotebookLogger;
export const storeLog = loggerManager.getLogger('store') as StoreLogger;
export const fileLog = loggerManager.getLogger('file') as FileLogger;
export const agentLog = loggerManager.getLogger('agent') as AgentLogger;

// Export the manager for configuration
export const loggerConfig = {
  /**
   * Configure individual logger settings
   * @example
   * loggerConfig.configure('storage', { enabled: false, level: LogLevel.ERROR });
   */
  configure: (loggerType: string, config: Partial<LoggerTypeConfig>) => 
    loggerManager.configureLogger(loggerType, config),

  /**
   * Configure multiple loggers at once
   * @example
   * loggerConfig.configureAll({
   *   storage: { enabled: false },
   *   api: { level: LogLevel.ERROR }
   * });
   */
  configureAll: (configs: Partial<GlobalLoggerConfig>) => 
    loggerManager.configureLoggers(configs),

  /**
   * Enable or disable a specific logger
   * @example
   * loggerConfig.setEnabled('storage', false);
   */
  setEnabled: (loggerType: string, enabled: boolean) => 
    loggerManager.setLoggerEnabled(loggerType, enabled),

  /**
   * Set log level for a specific logger
   * @example
   * loggerConfig.setLevel('api', LogLevel.ERROR);
   */
  setLevel: (loggerType: string, level: LogLevel) => 
    loggerManager.setLoggerLevel(loggerType, level),

  /**
   * Set global log level for all loggers
   * @example
   * loggerConfig.setGlobalLevel(LogLevel.WARN);
   */
  setGlobalLevel: (level: LogLevel) => 
    loggerManager.setGlobalLevel(level),

  /**
   * Set theme for all loggers
   * @example
   * loggerConfig.setTheme('neon');
   */
  setTheme: (theme: ThemeType) => 
    loggerManager.setTheme(theme),

  /**
   * Create a custom logger
   * @example
   * const myLogger = loggerConfig.createCustomLogger('MyModule');
   */
  createCustomLogger: (name: string, config?: LoggerConfig) => 
    loggerManager.createCustomLogger(name, config),

  /**
   * Get current configuration
   */
  getConfiguration: () => loggerManager.getConfiguration(),

  /**
   * Reset to default configuration
   */
  reset: () => loggerManager.reset(),

  /**
   * Disable all loggers
   */
  disableAll: () => loggerManager.disableAll(),

  /**
   * Enable all loggers
   */
  enableAll: () => loggerManager.enableAll()
};

// Export types and base classes
export type { LoggerConfig, ThemeType } from './base_logger';
export { LogLevel, Logger } from './base_logger';
export { StorageLogger } from './storage_logger';
export { ApiLogger } from './api_logger';
export { UILogger } from './ui_logger';
export { NetworkLogger } from './network_logger';
export { NotebookLogger } from './notebook_logger';
export { StoreLogger } from './store_logger';
export { FileLogger } from './file_logger';
export { AgentLogger } from './agent_logger';

// Import editor logger
import editorLogger from './editor_logger';
export { editorLogger };

// Import debug tools (will initialize global debugEditor)
import './debug_tools';

/**
 * Usage Examples:
 * 
 * // Basic usage with pre-configured loggers
 * import { storageLog, apiLog, uiLog, networkLog } from './logger';
 * 
 * storageLog.writeOperation('user_data', 1024);
 * apiLog.request('GET', '/api/users');
 * uiLog.componentMount('UserProfile');
 * networkLog.statusChange(false);
 * 
 * // Configuration examples
 * import { loggerConfig, LogLevel } from './logger';
 * 
 * // Disable storage logs
 * loggerConfig.setEnabled('storage', false);
 * 
 * // Set API logger to only show errors
 * loggerConfig.setLevel('api', LogLevel.ERROR);
 * 
 * // Configure multiple loggers
 * loggerConfig.configureAll({
 *   storage: { enabled: false },
 *   api: { level: LogLevel.ERROR },
 *   ui: { enabled: true, level: LogLevel.INFO }
 * });
 * 
 * // Set global theme
 * loggerConfig.setTheme('neon');
 * 
 * // Create custom logger
 * const myModuleLog = loggerConfig.createCustomLogger('MyModule');
 * myModuleLog.info('Custom module initialized');
 * 
 * // Reset all configurations
 * loggerConfig.reset();
 * 
 * // Disable all logging
 * loggerConfig.disableAll();
 */