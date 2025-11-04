/**
 * Logger utilities index
 * 导出所有日志工具并提供便捷的调试方法
 */

import editorLogger from './editor_logger';

// 在开发环境中暴露全局调试工具
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // 将日志工具暴露到全局
  (window as any).debugEditor = {
    logger: editorLogger,
    
    // 便捷方法
    getLogs: (count: number = 10) => editorLogger.getRecentLogs(count),
    getStats: () => editorLogger.getLogStats(),
    analyze: () => editorLogger.analyzeNavigationPatterns(),
    clear: () => editorLogger.clearLogs(),
    enable: () => editorLogger.enable(),
    disable: () => editorLogger.disable(),
    
    // 帮助信息
    help: () => {
      console.log(`
🔍 Editor Navigation Debug Tools

Available methods:
- debugEditor.getLogs(count)     - Get recent navigation logs
- debugEditor.getStats()         - Get log statistics
- debugEditor.analyze()          - Analyze navigation patterns
- debugEditor.clear()            - Clear all logs
- debugEditor.enable()           - Enable logging
- debugEditor.disable()          - Disable logging

Examples:
- debugEditor.getLogs(5)         - Get last 5 logs
- debugEditor.getStats()         - See navigation success/failure counts
- debugEditor.analyze()          - Get insights on navigation patterns

To see logs in real-time, just use the arrow keys to navigate between cells!
      `);
    }
  };
  
  // 输出初始化信息
  console.log('🚀 Editor Debug Tools loaded! Type "debugEditor.help()" for usage info.');
}

export { editorLogger };
export default editorLogger;