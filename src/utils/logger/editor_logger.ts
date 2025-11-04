/**
 * Editor Logger - 专门用于调试编辑器导航和cell切换的日志工具
 */

interface NavigationEvent {
  type: 'navigation_attempt' | 'navigation_success' | 'navigation_blocked' | 'focus_change' | 'edit_mode_change';
  cellId: string;
  cellType: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  fromCell?: string;
  toCell?: string;
  isEditing?: boolean;
  cursorPosition?: {
    line: number;
    isAtFirstLine: boolean;
    isAtLastLine: boolean;
    isAtDocStart: boolean;
    isAtDocEnd: boolean;
  };
  reason?: string;
  timestamp: number;
}

class EditorLogger {
  private logs: NavigationEvent[] = [];
  private maxLogs = 100;
  private enabled = true;

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  private addLog(event: NavigationEvent) {
    if (!this.enabled) return;
    
    this.logs.push(event);
    
    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 输出到控制台（开发环境）
    if (process.env.NODE_ENV === 'development') {
      const color = this.getLogColor(event.type);
      console.log(
        `%c[EditorNav] ${event.type}`,
        `color: ${color}; font-weight: bold;`,
        {
          cellId: event.cellId.substring(0, 8),
          cellType: event.cellType,
          direction: event.direction,
          isEditing: event.isEditing,
          cursorPos: event.cursorPosition,
          reason: event.reason,
          fromCell: event.fromCell?.substring(0, 8),
          toCell: event.toCell?.substring(0, 8),
        }
      );
    }
  }

  private getLogColor(type: NavigationEvent['type']): string {
    switch (type) {
      case 'navigation_attempt': return '#3b82f6'; // 蓝色
      case 'navigation_success': return '#10b981'; // 绿色
      case 'navigation_blocked': return '#ef4444'; // 红色
      case 'focus_change': return '#f59e0b'; // 橙色
      case 'edit_mode_change': return '#8b5cf6'; // 紫色
      default: return '#6b7280'; // 灰色
    }
  }

  // 记录导航尝试
  logNavigationAttempt(cellId: string, cellType: string, direction: 'up' | 'down' | 'left' | 'right', cursorInfo: any) {
    this.addLog({
      type: 'navigation_attempt',
      cellId,
      cellType,
      direction,
      cursorPosition: cursorInfo,
      timestamp: Date.now()
    });
  }

  // 记录导航成功
  logNavigationSuccess(fromCellId: string, toCellId: string, fromType: string, toType: string, direction: 'up' | 'down' | 'left' | 'right') {
    this.addLog({
      type: 'navigation_success',
      cellId: toCellId,
      cellType: toType,
      direction,
      fromCell: fromCellId,
      toCell: toCellId,
      timestamp: Date.now()
    });
  }

  // 记录导航被阻止
  logNavigationBlocked(cellId: string, cellType: string, direction: 'up' | 'down' | 'left' | 'right', reason: string) {
    this.addLog({
      type: 'navigation_blocked',
      cellId,
      cellType,
      direction,
      reason,
      timestamp: Date.now()
    });
  }

  // 记录焦点变化
  logFocusChange(cellId: string, cellType: string, hasFocus: boolean) {
    this.addLog({
      type: 'focus_change',
      cellId,
      cellType,
      reason: hasFocus ? 'gained_focus' : 'lost_focus',
      timestamp: Date.now()
    });
  }

  // 记录编辑模式变化
  logEditModeChange(cellId: string, cellType: string, isEditing: boolean) {
    this.addLog({
      type: 'edit_mode_change',
      cellId,
      cellType,
      isEditing,
      reason: isEditing ? 'enter_edit_mode' : 'exit_edit_mode',
      timestamp: Date.now()
    });
  }

  // 获取最近的日志
  getRecentLogs(count: number = 10): NavigationEvent[] {
    return this.logs.slice(-count);
  }

  // 清空日志
  clearLogs() {
    this.logs = [];
  }

  // 获取特定类型的日志统计
  getLogStats() {
    const stats = {
      navigation_attempt: 0,
      navigation_success: 0,
      navigation_blocked: 0,
      focus_change: 0,
      edit_mode_change: 0,
      total: this.logs.length
    };

    this.logs.forEach(log => {
      stats[log.type]++;
    });

    return stats;
  }

  // 导出日志为JSON（用于调试）
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // 分析导航模式
  analyzeNavigationPatterns() {
    const patterns = {
      mostActiveCell: '',
      mostCommonDirection: '',
      blockedNavigations: 0,
      successfulNavigations: 0,
      averageNavigationTime: 0
    };

    const cellActivity: { [key: string]: number } = {};
    const directionCount: { [key: string]: number } = {};
    const navigationTimes: number[] = [];
    let lastNavigationTime = 0;

    this.logs.forEach(log => {
      // 统计cell活动
      const shortId = log.cellId.substring(0, 8);
      cellActivity[shortId] = (cellActivity[shortId] || 0) + 1;

      // 统计方向
      if (log.direction) {
        directionCount[log.direction] = (directionCount[log.direction] || 0) + 1;
      }

      // 统计导航结果
      if (log.type === 'navigation_blocked') {
        patterns.blockedNavigations++;
      } else if (log.type === 'navigation_success') {
        patterns.successfulNavigations++;
        
        // 计算导航间隔时间
        if (lastNavigationTime > 0) {
          navigationTimes.push(log.timestamp - lastNavigationTime);
        }
        lastNavigationTime = log.timestamp;
      }
    });

    // 找出最活跃的cell
    patterns.mostActiveCell = Object.keys(cellActivity).reduce((a, b) => 
      cellActivity[a] > cellActivity[b] ? a : b, ''
    );

    // 找出最常用的方向
    patterns.mostCommonDirection = Object.keys(directionCount).reduce((a, b) => 
      directionCount[a] > directionCount[b] ? a : b, ''
    );

    // 计算平均导航时间
    if (navigationTimes.length > 0) {
      patterns.averageNavigationTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
    }

    return patterns;
  }
}

// 创建全局实例
const editorLogger = new EditorLogger();

// 将logger暴露到window对象（开发环境）
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).editorLogger = editorLogger;
}

export default editorLogger;