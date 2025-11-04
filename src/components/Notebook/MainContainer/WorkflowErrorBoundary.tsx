import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
  errorId: string;
}

/**
 * 工作流错误边界组件
 * 捕获工作流相关组件中的JavaScript错误，防止整个应用崩溃
 */
class WorkflowErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新state以显示错误UI
    return {
      hasError: true,
      error,
      retryCount: 0,
      errorId: Date.now().toString()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误信息
    console.error('WorkflowErrorBoundary caught an error:', error, errorInfo);

    this.setState(prevState => ({
      error,
      errorInfo,
      errorId: Date.now().toString()
    }));

    // 调用外部错误处理器
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // 发送错误报告到后端
    this.reportError(error, errorInfo);
  }

  reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        errorId: this.state.errorId
      };

      console.log('Error report generated:', errorReport);

      // 这里可以发送到后端错误收集服务
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });
    } catch (e) {
      console.error('Failed to report error:', e);
    }
  };

  handleRetry = () => {
    const maxRetries = this.props.maxRetries || 3;

    if (this.state.retryCount >= maxRetries) {
      console.warn('Maximum retry attempts reached');
      return;
    }

    // 重置错误状态并增加重试计数
    this.setState(prevState => ({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: prevState.retryCount + 1,
      errorId: ''
    }));
  };

  handleReset = () => {
    // 完全重置状态
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: 0,
      errorId: ''
    });

    // 刷新页面作为最后的重置手段
    window.location.reload();
  };

  getErrorSeverity = (error: Error): 'low' | 'medium' | 'high' => {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('load')) {
      return 'medium';
    }

    if (message.includes('chunk') || message.includes('loading') || message.includes('script')) {
      return 'low';
    }

    if (message.includes('undefined') && message.includes('find')) {
      return 'medium';
    }

    return 'high';
  };

  getErrorSuggestion = (error: Error): string => {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return '网络连接问题，请检查网络后重试。';
    }

    if (message.includes('chunk') || message.includes('loading') || message.includes('script')) {
      return '资源加载失败，请刷新页面重试。';
    }

    if (message.includes('undefined') && message.includes('find')) {
      return '数据结构异常，这可能是临时问题，请重试。';
    }

    if (message.includes('permission') || message.includes('access')) {
      return '权限问题，请刷新页面或联系管理员。';
    }

    return '发生了未知错误，请重试或刷新页面。';
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const maxRetries = this.props.maxRetries || 3;
      const severity = this.state.error ? this.getErrorSeverity(this.state.error) : 'medium';
      const suggestion = this.state.error ? this.getErrorSuggestion(this.state.error) : '';
      const canRetry = this.state.retryCount < maxRetries;

      // 根据严重程度选择颜色
      const severityColors = {
        low: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: 'text-yellow-500', button: 'bg-yellow-600 hover:bg-yellow-700' },
        medium: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', icon: 'text-orange-500', button: 'bg-orange-600 hover:bg-orange-700' },
        high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'text-red-500', button: 'bg-red-600 hover:bg-red-700' }
      };

      const colors = severityColors[severity];

      // 默认错误UI
      return (
        <div className={`flex flex-col items-center justify-center p-8 ${colors.bg} border ${colors.border} rounded-lg max-w-2xl mx-auto`}>
          <AlertTriangle className={`w-12 h-12 ${colors.icon} mb-4`} />
          <h3 className={`text-lg font-semibold ${colors.text} mb-2`}>
            {severity === 'high' ? '严重错误' : severity === 'medium' ? '工作流中断' : '轻微问题'}
          </h3>
          <p className={`${colors.text} text-center mb-4 max-w-md leading-relaxed`}>
            {suggestion}
          </p>

          {/* 重试计数显示 */}
          {this.state.retryCount > 0 && (
            <p className="text-gray-600 text-sm mb-4">
              已重试 {this.state.retryCount}/{maxRetries} 次
            </p>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 mb-4">
            <button
              onClick={this.handleRetry}
              disabled={!canRetry}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors ${
                canRetry ? colors.button : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              {canRetry ? '重试' : '重试次数已达上限'}
            </button>

            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              重置页面
            </button>
          </div>

          {/* 错误详情（开发环境或高严重度错误） */}
          {(process.env.NODE_ENV === 'development' || severity === 'high') && this.state.error && (
            <details className={`mb-4 p-3 ${colors.bg} rounded border text-sm ${colors.text} max-w-full overflow-auto w-full`}>
              <summary className="cursor-pointer font-medium mb-2">技术详情 (点击展开)</summary>
              <div className="space-y-2">
                <div>
                  <strong>错误信息:</strong>
                  <pre className="mt-1 whitespace-pre-wrap text-xs bg-white p-2 rounded border">
                    {this.state.error.toString()}
                  </pre>
                </div>
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <strong>组件堆栈:</strong>
                    <pre className="mt-1 whitespace-pre-wrap text-xs bg-white p-2 rounded border max-h-32 overflow-y-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
                <div className="text-xs text-gray-600">
                  <strong>错误ID:</strong> {this.state.errorId}<br />
                  <strong>时间:</strong> {new Date().toLocaleString()}
                </div>
              </div>
            </details>
          )}

          {/* 帮助信息 */}
          <div className="text-xs text-gray-500 text-center max-w-md">
            如果问题持续存在，请尝试刷新页面或联系技术支持。
            {this.state.errorId && (
              <>
                <br />错误ID: {this.state.errorId}
              </>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default WorkflowErrorBoundary;
