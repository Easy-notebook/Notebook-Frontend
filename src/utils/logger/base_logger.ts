/**
 * 日志等级枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
  NONE = 999,
}

/**
 * 日志样式接口
 */
export interface LogStyle {
  color?: string;
  backgroundColor?: string;
  fontSize?: string | number;
  fontWeight?: 'normal' | 'bold' | 'lighter' | 'bolder' | number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  textDecoration?: 'none' | 'underline' | 'overline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: string | number;
  lineHeight?: string | number;
  padding?: string | number;
  margin?: string | number;
  borderRadius?: string | number;
  border?: string;
  display?: 'block' | 'inline' | 'inline-block';
  background?: string;
  boxShadow?: string;
  textShadow?: string;
  opacity?: number;
  animation?: string;
  transition?: string;
}

/**
 * 日志元素类型
 */
export interface LogElement {
  type: 'text' | 'badge' | 'link' | 'code' | 'table' | 'group' | 'divider' | 'image';
  content?: any;
  style?: LogStyle;
  children?: LogElement[];
  props?: Record<string, any>;
}

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  level?: LogLevel;
  enableColors?: boolean;
  enableTimestamp?: boolean;
  enableStackTrace?: boolean;
  dateFormat?: 'ISO' | 'LOCAL' | 'TIMESTAMP' | 'RELATIVE';
  customPrefix?: string;
  defaultStyles?: Record<LogLevel, LogStyle>;
  groupIcon?: string;
  maxDepth?: number;
  enableAnimations?: boolean;
}

/**
 * 日志分组配置
 */
interface LogGroup {
  name: string;
  enabled: boolean;
  config?: LoggerConfig;
  icon?: string;
  color?: string;
}

/**
 * 主题类型
 */
export type ThemeType = 'default' | 'neon' | 'minimal';

/**
 * 主题配置类型
 */
export type ThemeConfig = Record<LogLevel, LogStyle>;

/**
 * 默认主题
 */
export const Themes: Record<ThemeType, ThemeConfig> = {
  default: {
    [LogLevel.DEBUG]: {
      color: '#6B7280',
      backgroundColor: 'transparent',
      fontSize: '12px',
    },
    [LogLevel.INFO]: {
      color: '#3B82F6',
      backgroundColor: 'transparent',
      fontSize: '12px',
    },
    [LogLevel.WARN]: {
      color: '#F59E0B',
      backgroundColor: '#FEF3C7',
      fontSize: '12px',
      fontWeight: 'bold',
      padding: '2px 6px',
      borderRadius: '3px',
    },
    [LogLevel.ERROR]: {
      color: '#FFFFFF',
      backgroundColor: '#EF4444',
      fontSize: '13px',
      fontWeight: 'bold',
      padding: '3px 8px',
      borderRadius: '4px',
    },
    [LogLevel.FATAL]: {
      color: '#FFFFFF',
      background: 'linear-gradient(to right, #991B1B, #DC2626)',
      fontSize: '14px',
      fontWeight: 'bold',
      padding: '4px 10px',
      borderRadius: '5px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    },
    [LogLevel.NONE]: {
      color: '#000000',
      backgroundColor: 'transparent',
    },
  },
  neon: {
    [LogLevel.DEBUG]: {
      color: '#00FF00',
      textShadow: '0 0 5px #00FF00',
      backgroundColor: '#000000',
      padding: '2px 6px',
    },
    [LogLevel.INFO]: {
      color: '#00FFFF',
      textShadow: '0 0 5px #00FFFF',
      backgroundColor: '#000000',
      padding: '2px 6px',
    },
    [LogLevel.WARN]: {
      color: '#FFFF00',
      textShadow: '0 0 5px #FFFF00',
      backgroundColor: '#000000',
      padding: '2px 6px',
    },
    [LogLevel.ERROR]: {
      color: '#FF00FF',
      textShadow: '0 0 5px #FF00FF',
      backgroundColor: '#000000',
      padding: '2px 6px',
    },
    [LogLevel.FATAL]: {
      color: '#FF0000',
      textShadow: '0 0 10px #FF0000, 0 0 20px #FF0000',
      backgroundColor: '#000000',
      padding: '4px 8px',
      animation: 'blink 1s infinite',
    },
    [LogLevel.NONE]: {
      color: '#FFFFFF',
      backgroundColor: '#000000',
    },
  },
  minimal: {
    [LogLevel.DEBUG]: { color: '#999999' },
    [LogLevel.INFO]: { color: '#333333' },
    [LogLevel.WARN]: { color: '#FF6B00' },
    [LogLevel.ERROR]: { color: '#FF0000' },
    [LogLevel.FATAL]: {
      color: '#FFFFFF',
      backgroundColor: '#FF0000',
      padding: '2px 4px',
    },
    [LogLevel.NONE]: { color: '#000000' },
  },
};

/**
 * 日志图标
 */
const LogIcons: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '🔍',
  [LogLevel.INFO]: '📘',
  [LogLevel.WARN]: '⚠️',
  [LogLevel.ERROR]: '❌',
  [LogLevel.FATAL]: '💀',
  [LogLevel.NONE]: '',
};

/**
 * 控制台方法类型
 */
type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

/**
 * 高级日志构建器类
 */
export class LogBuilder {
  private elements: LogElement[] = [];

  /**
   * 添加文本
   */
  public text(content: string, style?: LogStyle): LogBuilder {
    this.elements.push({ type: 'text', content, style });
    return this;
  }

  /**
   * 添加徽章
   */
  public badge(content: string, style?: LogStyle): LogBuilder {
    const defaultStyle: LogStyle = {
      backgroundColor: '#3B82F6',
      color: '#FFFFFF',
      padding: '2px 6px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 'bold',
      ...style,
    };
    this.elements.push({ type: 'badge', content, style: defaultStyle });
    return this;
  }

  /**
   * 添加链接
   */
  public link(content: string, href: string, style?: LogStyle): LogBuilder {
    const defaultStyle: LogStyle = {
      color: '#3B82F6',
      textDecoration: 'underline',
      ...style,
    };
    this.elements.push({
      type: 'link',
      content,
      style: defaultStyle,
      props: { href },
    });
    return this;
  }

  /**
   * 添加代码块
   */
  public code(content: string, language?: string, style?: LogStyle): LogBuilder {
    const defaultStyle: LogStyle = {
      backgroundColor: '#F3F4F6',
      color: '#1F2937',
      fontFamily: 'monospace',
      fontSize: '11px',
      padding: '2px 4px',
      borderRadius: '3px',
      ...style,
    };
    this.elements.push({
      type: 'code',
      content,
      style: defaultStyle,
      props: { language },
    });
    return this;
  }

  /**
   * 添加分隔线
   */
  public divider(style?: LogStyle): LogBuilder {
    const defaultStyle: LogStyle = {
      color: '#E5E7EB',
      ...style,
    };
    this.elements.push({ type: 'divider', style: defaultStyle });
    return this;
  }

  /**
   * 添加图片
   */
  public image(url: string, width?: number, height?: number): LogBuilder {
    this.elements.push({
      type: 'image',
      content: url,
      props: { width, height },
    });
    return this;
  }

  /**
   * 添加表格
   */
  public table(data: any[], columns?: string[]): LogBuilder {
    this.elements.push({
      type: 'table',
      content: data,
      props: { columns },
    });
    return this;
  }

  /**
   * 创建组
   */
  public group(label: string, collapsed = false): LogBuilder {
    this.elements.push({
      type: 'group',
      content: label,
      props: { collapsed },
    });
    return this;
  }

  /**
   * 换行
   */
  public newLine(): LogBuilder {
    this.text('\n');
    return this;
  }

  /**
   * 空格
   */
  public space(count = 1): LogBuilder {
    this.text(' '.repeat(count));
    return this;
  }

  /**
   * 构建元素
   */
  public build(): LogElement[] {
    return this.elements;
  }
}

/**
 * 现代化日志类
 */
export class Logger {
  private static globalLevel: LogLevel = LogLevel.DEBUG;
  private static groups: Map<string, LogGroup> = new Map();
  private static theme: ThemeConfig = Themes.default;

  private groupName: string;
  private config: Required<LoggerConfig>;

  constructor(groupName = 'default', config?: LoggerConfig) {
    this.groupName = groupName;

    // 确保所有配置都有默认值
    this.config = {
      level: config?.level ?? LogLevel.DEBUG,
      enableColors: config?.enableColors ?? true,
      enableTimestamp: config?.enableTimestamp ?? true,
      enableStackTrace: config?.enableStackTrace ?? false,
      dateFormat: config?.dateFormat ?? 'ISO',
      customPrefix: config?.customPrefix ?? '',
      defaultStyles: config?.defaultStyles ?? Logger.theme,
      groupIcon: config?.groupIcon ?? '',
      maxDepth: config?.maxDepth ?? 10,
      enableAnimations: config?.enableAnimations ?? true,
    };

    if (!Logger.groups.has(groupName)) {
      Logger.registerGroup(groupName, true, this.config);
    }
  }

  /**
   * 设置主题
   */
  public static setTheme(theme: ThemeType | ThemeConfig): void {
    if (typeof theme === 'string') {
      Logger.theme = Themes[theme];
    } else {
      Logger.theme = theme;
    }
  }

  /**
   * 注册日志组
   */
  public static registerGroup(
    name: string,
    enabled = true,
    config?: LoggerConfig,
    icon?: string,
    color?: string
  ): void {
    Logger.groups.set(name, {
      name,
      enabled,
      config,
      icon,
      color,
    });
  }

  /**
   * 设置组的启用/禁用状态
   */
  public static setGroupEnabled(groupName: string, enabled: boolean): void {
    const group = Logger.groups.get(groupName);
    if (group) {
      group.enabled = enabled;
    } else {
      Logger.registerGroup(groupName, enabled);
    }
  }

  /**
   * 批量设置组状态
   */
  public static setGroupsEnabled(groups: Record<string, boolean>): void {
    Object.entries(groups).forEach(([name, enabled]) => {
      Logger.setGroupEnabled(name, enabled);
    });
  }

  /**
   * 获取所有组的状态
   */
  public static getGroups(): Record<string, LogGroup> {
    const result: Record<string, LogGroup> = {};
    Logger.groups.forEach((group, name) => {
      result[name] = group;
    });
    return result;
  }

  /**
   * 设置全局日志等级
   */
  public static setGlobalLevel(level: LogLevel): void {
    Logger.globalLevel = level;
  }

  /**
   * 检查是否为浏览器环境
   */
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined';
  }

  /**
   * 获取时间戳
   */
  private getTimestamp(): string {
    const now = new Date();
    switch (this.config.dateFormat) {
      case 'LOCAL':
        return now.toLocaleTimeString();
      case 'TIMESTAMP':
        return now.getTime().toString();
      case 'RELATIVE':
        return this.getRelativeTime(now);
      case 'ISO':
      default:
        return now.toISOString();
    }
  }

  /**
   * 获取相对时间
   */
  private getRelativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  }

  /**
   * 样式对象转CSS字符串
   */
  private styleToCSS(style: LogStyle): string {
    const cssMap: Record<string, string | undefined> = {
      color: style.color,
      backgroundColor: style.backgroundColor,
      background: style.background,
      fontSize: typeof style.fontSize === 'number' ? `${style.fontSize}px` : style.fontSize,
      fontWeight: style.fontWeight?.toString(),
      fontFamily: style.fontFamily,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecoration,
      textTransform: style.textTransform,
      letterSpacing:
        typeof style.letterSpacing === 'number' ? `${style.letterSpacing}px` : style.letterSpacing,
      lineHeight: typeof style.lineHeight === 'number' ? `${style.lineHeight}px` : style.lineHeight,
      padding: typeof style.padding === 'number' ? `${style.padding}px` : style.padding,
      margin: typeof style.margin === 'number' ? `${style.margin}px` : style.margin,
      borderRadius:
        typeof style.borderRadius === 'number' ? `${style.borderRadius}px` : style.borderRadius,
      border: style.border,
      display: style.display,
      boxShadow: style.boxShadow,
      textShadow: style.textShadow,
      opacity: style.opacity?.toString(),
      animation: style.animation,
      transition: style.transition,
    };

    return Object.entries(cssMap)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}: ${value}`;
      })
      .join('; ');
  }

  /**
   * 渲染日志元素
   */
  private renderElements(elements: LogElement[]): { format: string; args: any[] } {
    if (!this.isBrowser()) {
      // Node.js 环境
      const text = elements
        .map((el) => {
          switch (el.type) {
            case 'text':
            case 'badge':
            case 'code':
              return el.content || '';
            case 'link':
              return `${el.content} (${el.props?.href || ''})`;
            case 'divider':
              return '---';
            case 'table':
              return '[Table]';
            case 'group':
              return `[${el.content}]`;
            case 'image':
              return `[Image: ${el.content}]`;
            default:
              return '';
          }
        })
        .join(' ');
      return { format: text, args: [] };
    }

    // 浏览器环境
    let format = '';
    const args: any[] = [];

    elements.forEach((el) => {
      switch (el.type) {
        case 'text':
        case 'badge':
        case 'code':
          if (el.style && this.config.enableColors) {
            format += `%c${el.content || ''}`;
            args.push(this.styleToCSS(el.style));
          } else {
            format += el.content || '';
          }
          break;

        case 'link':
          if (el.style && this.config.enableColors) {
            format += `%c${el.content || ''}`;
            args.push(this.styleToCSS(el.style));
          } else {
            format += el.content || '';
          }
          format += ` (${el.props?.href || ''})`;
          break;

        case 'divider':
          format += '\n' + '─'.repeat(50) + '\n';
          break;

        case 'image':
          if (this.isBrowser()) {
            const width = el.props?.width || 100;
            const height = el.props?.height || 100;
            format += '%c ';
            args.push(`
                padding: ${height / 2}px ${width / 2}px;
                background: url(${el.content}) no-repeat center;
                background-size: contain;
              `);
          }
          break;

        case 'table':
        case 'group':
          // 这些将单独处理
          break;
      }
    });

    return { format, args };
  }

  /**
   * 高级日志输出
   */
  protected logAdvanced(level: LogLevel, builder: LogBuilder | string, ...extraArgs: any[]): void {
    const group = Logger.groups.get(this.groupName);
    const isEnabled = group?.enabled ?? true;

    if (!isEnabled) return;

    const effectiveLevel = group?.config?.level ?? this.config.level ?? Logger.globalLevel;
    if (level < effectiveLevel) return;

    const elements: LogElement[] = [];

    // 添加图标
    const icon = group?.icon || LogIcons[level];
    const levelStyle = this.config.defaultStyles[level] || Logger.theme[level];

    elements.push({
      type: 'badge',
      content: icon,
      style: levelStyle,
    });

    // 添加组名
    const groupColor = group?.color || '#9333EA';
    elements.push({
      type: 'badge',
      content: this.groupName,
      style: {
        color: groupColor,
        backgroundColor: 'transparent',
        fontWeight: 'bold',
        margin: '0 8px',
      },
    });

    // 添加时间戳
    if (this.config.enableTimestamp) {
      elements.push({
        type: 'text',
        content: ` ${this.getTimestamp()} `,
        style: { color: '#6B7280', fontSize: '11px' },
      });
    }

    // 添加自定义前缀
    if (this.config.customPrefix) {
      elements.push({
        type: 'text',
        content: this.config.customPrefix + ' ',
        style: { color: '#9CA3AF' },
      });
    }

    // 添加消息内容
    if (typeof builder === 'string') {
      elements.push({
        type: 'text',
        content: builder,
        style: { color: 'inherit' },
      });
    } else {
      elements.push(...builder.build());
    }

    // 渲染并输出
    const { format, args } = this.renderElements(elements);

    if (format) {
      const methods: Record<LogLevel, ConsoleMethod> = {
        [LogLevel.DEBUG]: 'log',
        [LogLevel.INFO]: 'info',
        [LogLevel.WARN]: 'warn',
        [LogLevel.ERROR]: 'error',
        [LogLevel.FATAL]: 'error',
        [LogLevel.NONE]: 'log',
      };

      const methodName = methods[level];
      const method = console[methodName];

      method.apply(console, [format, ...args, ...extraArgs]);

      // 处理表格
      const tableElements = elements.filter((el) => el.type === 'table');
      tableElements.forEach((el) => {
        if (el.content) {
          console.table(el.content, el.props?.columns);
        }
      });

      // 堆栈跟踪
      if (this.config.enableStackTrace && (level === LogLevel.ERROR || level === LogLevel.FATAL)) {
        console.trace();
      }
    }
  }

  /**
   * 公共日志方法
   */
  public debug(message: string | LogBuilder, ...args: any[]): void {
    this.logAdvanced(LogLevel.DEBUG, message, ...args);
  }

  public info(message: string | LogBuilder, ...args: any[]): void {
    this.logAdvanced(LogLevel.INFO, message, ...args);
  }

  public warn(message: string | LogBuilder, ...args: any[]): void {
    this.logAdvanced(LogLevel.WARN, message, ...args);
  }

  public error(message: string | LogBuilder, ...args: any[]): void {
    this.logAdvanced(LogLevel.ERROR, message, ...args);
  }

  public fatal(message: string | LogBuilder, ...args: any[]): void {
    this.logAdvanced(LogLevel.FATAL, message, ...args);
  }

  /**
   * 创建日志构建器
   */
  public builder(): LogBuilder {
    return new LogBuilder();
  }

  /**
   * 创建子日志器
   */
  public createChild(subGroupName: string, config?: LoggerConfig): Logger {
    const childGroupName = `${this.groupName}.${subGroupName}`;
    return new Logger(childGroupName, { ...this.config, ...config });
  }

  /**
   * 性能计时
   */
  public time(label: string): void {
    console.time(`[${this.groupName}] ${label}`);
  }

  public timeEnd(label: string): void {
    console.timeEnd(`[${this.groupName}] ${label}`);
  }

  /**
   * 计数器
   */
  public count(label: string): void {
    console.count(`[${this.groupName}] ${label}`);
  }

  public countReset(label: string): void {
    console.countReset(`[${this.groupName}] ${label}`);
  }

  /**
   * 断言
   */
  public assert(condition: boolean, message: string): void {
    console.assert(condition, `[${this.groupName}] ${message}`);
  }

  /**
   * 清空控制台
   */
  public clear(): void {
    console.clear();
  }
}

/**
 * React 风格的日志组件
 */
export class Log {
  private logger: Logger;
  private level: LogLevel;

  constructor(groupName = 'default', level: LogLevel = LogLevel.INFO) {
    this.logger = new Logger(groupName);
    this.level = level;
  }

  /**
   * 渲染日志
   */
  public render(builder: (log: LogBuilder) => LogBuilder): void {
    const logBuilder = new LogBuilder();
    const result = builder(logBuilder);

    // 使用公共方法而不是受保护的方法
    switch (this.level) {
      case LogLevel.DEBUG:
        this.logger.debug(result);
        break;
      case LogLevel.INFO:
        this.logger.info(result);
        break;
      case LogLevel.WARN:
        this.logger.warn(result);
        break;
      case LogLevel.ERROR:
        this.logger.error(result);
        break;
      case LogLevel.FATAL:
        this.logger.fatal(result);
        break;
      default:
        this.logger.info(result);
    }
  }

  /**
   * 静态渲染方法
   */
  public static render(
    groupName: string,
    level: LogLevel,
    builder: (log: LogBuilder) => LogBuilder
  ): void {
    const log = new Log(groupName, level);
    log.render(builder);
  }
}

/**
 * 导出便捷函数
 */
export function createLogger(groupName: string, config?: LoggerConfig): Logger {
  return new Logger(groupName, config);
}

/**
 * 使用示例
 */
export function examples(): void {
  // 示例1: 基础使用
  const logger = new Logger('MyApp');
  logger.info('应用启动成功');
  logger.warn('内存使用率较高');
  logger.error('连接失败', { errorCode: 500 });

  // 示例2: 使用 LogBuilder 创建复杂日志
  logger.info(
    logger
      .builder()
      .text('用户 ')
      .badge('John Doe', { backgroundColor: '#10B981', color: '#FFFFFF' })
      .text(' 已登录，IP: ')
      .code('192.168.1.1', 'text')
      .text(' 来自 ')
      .link('查看详情', 'https://example.com/user/123')
  );

  // 示例3: React 风格的声明式日志
  Log.render('UI', LogLevel.INFO, (log) =>
    log
      .badge('组件', { backgroundColor: '#8B5CF6' })
      .text(' Button 已渲染，耗时 ')
      .code('15ms', 'javascript', { color: '#059669' })
      .text(' | Props: ')
      .code('{ variant: "primary", size: "lg" }', 'json')
  );

  // 示例4: 设置主题
  Logger.setTheme('neon');
  const neonLogger = new Logger('NeonApp');
  neonLogger.error('Cyberpunk style error');

  // 示例5: 分组管理
  Logger.setGroupsEnabled({
    MyApp: true,
    'MyApp.Database': true,
    'MyApp.API': false,
    UI: true,
  });

  // 示例6: 表格数据
  const performanceData = [
    { api: 'GET /users', time: '45ms', status: 200 },
    { api: 'POST /login', time: '120ms', status: 200 },
    { api: 'GET /profile', time: '32ms', status: 401 },
  ];

  logger.info(logger.builder().text('API 性能报告:').newLine().table(performanceData));

  // 示例7: 子日志器
  const dbLogger = logger.createChild('Database');
  dbLogger.debug('连接池初始化');

  // 示例8: 性能监控
  logger.time('数据加载');
  setTimeout(() => {
    logger.timeEnd('数据加载');
  }, 1000);

  // 示例9: 自定义主题
  Logger.setTheme({
    [LogLevel.DEBUG]: { color: '#808080' },
    [LogLevel.INFO]: { color: '#0080FF' },
    [LogLevel.WARN]: { color: '#FFA500', fontWeight: 'bold' },
    [LogLevel.ERROR]: { color: '#FF0000', fontWeight: 'bold' },
    [LogLevel.FATAL]: {
      color: '#FFFFFF',
      backgroundColor: '#8B0000',
      fontWeight: 'bold',
      padding: '4px 8px',
    },
    [LogLevel.NONE]: { color: '#000000' },
  });
}
