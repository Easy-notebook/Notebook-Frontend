/**
 * Streaming Execution Debug Logger
 *
 * 用于调试 action 流式执行的性能和正确性
 *
 * 使用方法:
 * 1. 在需要调试的地方 import StreamingDebugLogger
 * 2. 调用相应的日志方法
 * 3. 执行工作流
 * 4. 调用 logger.printReport() 查看报告
 */

interface ActionLog {
  actionIndex: number;
  actionType: string;
  receivedAt: number;
  executionStartAt: number;
  executionEndAt: number;
  error?: string;
}

interface StreamingSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  actions: ActionLog[];
  streamingStarted: boolean;
  streamingEnded: boolean;
}

class StreamingDebugLogger {
  private currentSession: StreamingSession | null = null;
  private sessions: StreamingSession[] = [];

  /**
   * 开始一个新的流式执行会话
   */
  startSession(sessionId = `session-${Date.now()}`): void {
    this.currentSession = {
      sessionId,
      startTime: Date.now(),
      actions: [],
      streamingStarted: false,
      streamingEnded: false,
    };
    console.log(`[StreamLogger] 📝 Session started: ${sessionId}`);
  }

  /**
   * 标记流式执行开始
   */
  streamingStarted(): void {
    if (!this.currentSession) {
      console.warn('[StreamLogger] No active session');
      return;
    }
    this.currentSession.streamingStarted = true;
    console.log('[StreamLogger] 🌊 Streaming started');
  }

  /**
   * 记录 action 接收
   */
  actionReceived(actionIndex: number, actionType: string): void {
    if (!this.currentSession) {
      console.warn('[StreamLogger] No active session');
      return;
    }

    const log: ActionLog = {
      actionIndex,
      actionType,
      receivedAt: Date.now(),
      executionStartAt: 0,
      executionEndAt: 0,
    };

    this.currentSession.actions.push(log);

    const receivedDelay = log.receivedAt - this.currentSession.startTime;
    const prevAction = this.currentSession.actions[actionIndex - 1];
    const intervalFromPrev = prevAction ? log.receivedAt - prevAction.receivedAt : 0;

    console.log(
      `[StreamLogger] 📨 Action ${actionIndex + 1} received: ${actionType} ` +
        `(+${receivedDelay}ms from start, +${intervalFromPrev}ms from prev)`
    );
  }

  /**
   * 记录 action 执行开始
   */
  actionExecutionStart(actionIndex: number): void {
    if (!this.currentSession) return;

    const action = this.currentSession.actions[actionIndex];
    if (!action) {
      console.warn(`[StreamLogger] Action ${actionIndex} not found`);
      return;
    }

    action.executionStartAt = Date.now();
    const waitTime = action.executionStartAt - action.receivedAt;

    console.log(
      `[StreamLogger] ⚡ Action ${actionIndex + 1} execution started ` + `(waited ${waitTime}ms)`
    );
  }

  /**
   * 记录 action 执行完成
   */
  actionExecutionEnd(actionIndex: number, error?: string): void {
    if (!this.currentSession) return;

    const action = this.currentSession.actions[actionIndex];
    if (!action) {
      console.warn(`[StreamLogger] Action ${actionIndex} not found`);
      return;
    }

    action.executionEndAt = Date.now();
    action.error = error;

    const execTime = action.executionEndAt - action.executionStartAt;
    const totalTime = action.executionEndAt - action.receivedAt;

    if (error) {
      console.error(
        `[StreamLogger] ❌ Action ${actionIndex + 1} failed: ${error} ` +
          `(exec ${execTime}ms, total ${totalTime}ms)`
      );
    } else {
      console.log(
        `[StreamLogger] ✅ Action ${actionIndex + 1} completed: ${action.actionType} ` +
          `(exec ${execTime}ms, total ${totalTime}ms)`
      );
    }
  }

  /**
   * 标记流式执行结束
   */
  streamingEnded(): void {
    if (!this.currentSession) {
      console.warn('[StreamLogger] No active session');
      return;
    }

    this.currentSession.streamingEnded = true;
    this.currentSession.endTime = Date.now();

    const totalTime = this.currentSession.endTime - this.currentSession.startTime;
    console.log(
      `[StreamLogger] 🏁 Streaming ended (total ${totalTime}ms, ${this.currentSession.actions.length} actions)`
    );
  }

  /**
   * 结束当前会话
   */
  endSession(): void {
    if (!this.currentSession) {
      console.warn('[StreamLogger] No active session');
      return;
    }

    if (!this.currentSession.endTime) {
      this.currentSession.endTime = Date.now();
    }

    this.sessions.push(this.currentSession);
    console.log(`[StreamLogger] 📋 Session ended: ${this.currentSession.sessionId}`);
    this.currentSession = null;
  }

  /**
   * 打印性能报告
   */
  printReport(): void {
    const session = this.sessions[this.sessions.length - 1] || this.currentSession;

    if (!session) {
      console.log('[StreamLogger] No session data available');
      return;
    }

    console.group('📊 Streaming Performance Report');

    // Session info
    console.log('\n=== Session Info ===');
    console.log(`Session ID: ${session.sessionId}`);
    console.log(`Total time: ${(session.endTime || Date.now()) - session.startTime}ms`);
    console.log(`Total actions: ${session.actions.length}`);

    // Actions summary
    console.log('\n=== Actions Timeline ===');
    session.actions.forEach((action, idx) => {
      const receivedOffset = action.receivedAt - session.startTime;
      const execTime = action.executionEndAt - action.executionStartAt;
      const waitTime = action.executionStartAt - action.receivedAt;
      const prevAction = session.actions[idx - 1];
      const interval = prevAction ? action.receivedAt - prevAction.executionEndAt : 0;

      console.log(
        `${idx + 1}. ${action.actionType.padEnd(20)} | ` +
          `Received: +${receivedOffset}ms | ` +
          `Waited: ${waitTime}ms | ` +
          `Exec: ${execTime}ms | ` +
          `Interval: ${interval}ms` +
          (action.error ? ` | ❌ ${action.error}` : '')
      );
    });

    // Performance metrics
    console.log('\n=== Performance Metrics ===');
    const firstAction = session.actions[0];
    const lastAction = session.actions[session.actions.length - 1];

    if (firstAction) {
      const firstActionDelay = firstAction.receivedAt - session.startTime;
      console.log(`First action delay: ${firstActionDelay}ms`);
    }

    if (session.actions.length > 1) {
      const intervals = session.actions.slice(1).map((action, idx) => {
        const prevAction = session.actions[idx];
        return action.receivedAt - prevAction.receivedAt;
      });

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const maxInterval = Math.max(...intervals);
      const minInterval = Math.min(...intervals);

      console.log(`Avg action interval: ${avgInterval.toFixed(2)}ms`);
      console.log(`Max action interval: ${maxInterval}ms`);
      console.log(`Min action interval: ${minInterval}ms`);
    }

    const executionTimes = session.actions
      .map((a) => a.executionEndAt - a.executionStartAt)
      .filter((t) => t > 0);

    if (executionTimes.length > 0) {
      const avgExecTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
      const maxExecTime = Math.max(...executionTimes);
      const minExecTime = Math.min(...executionTimes);

      console.log(`Avg execution time: ${avgExecTime.toFixed(2)}ms`);
      console.log(`Max execution time: ${maxExecTime}ms`);
      console.log(`Min execution time: ${minExecTime}ms`);
    }

    // Issues detection
    console.log('\n=== Issues Detection ===');
    const errors = session.actions.filter((a) => a.error);
    const slowActions = session.actions.filter((a) => a.executionEndAt - a.executionStartAt > 1000);
    const longWaits = session.actions.filter((a) => a.executionStartAt - a.receivedAt > 100);

    if (errors.length > 0) {
      console.warn(`❌ ${errors.length} actions failed`);
    }
    if (slowActions.length > 0) {
      console.warn(`⚠️ ${slowActions.length} slow actions (>1s)`);
    }
    if (longWaits.length > 0) {
      console.warn(`⚠️ ${longWaits.length} long waits (>100ms)`);
    }
    if (errors.length === 0 && slowActions.length === 0 && longWaits.length === 0) {
      console.log('✅ No issues detected');
    }

    console.groupEnd();
  }

  /**
   * 导出会话数据为 JSON
   */
  exportSessionData(): string {
    const session = this.sessions[this.sessions.length - 1] || this.currentSession;
    if (!session) {
      return JSON.stringify({ error: 'No session data' }, null, 2);
    }
    return JSON.stringify(session, null, 2);
  }

  /**
   * 清除所有会话数据
   */
  clearSessions(): void {
    this.sessions = [];
    this.currentSession = null;
    console.log('[StreamLogger] All sessions cleared');
  }
}

// 全局单例
export const streamingLogger = new StreamingDebugLogger();

// 便捷导出
export default streamingLogger;
