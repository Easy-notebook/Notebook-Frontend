import { useState, useCallback } from 'react';

export interface ErrorInfo {
  message: string;
  code?: string | number;
  details?: any;
  timestamp: string;
  retryable: boolean;
  severity: 'low' | 'medium' | 'high';
}

export interface ErrorHandlerState {
  error: ErrorInfo | null;
  isLoading: boolean;
  retryCount: number;
}

export interface ErrorHandlerOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: ErrorInfo) => void;
  onRetry?: (retryCount: number) => void;
  onMaxRetriesReached?: () => void;
}

/**
 * 错误处理Hook
 * 提供统一的错误处理、重试机制和用户反馈
 */
export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onError,
    onRetry,
    onMaxRetriesReached
  } = options;

  const [state, setState] = useState<ErrorHandlerState>({
    error: null,
    isLoading: false,
    retryCount: 0
  });

  // 分析错误类型和严重程度
  const analyzeError = useCallback((error: any): ErrorInfo => {
    let message = '发生了未知错误';
    let code: string | number | undefined;
    let details: any;
    let retryable = true;
    let severity: 'low' | 'medium' | 'high' = 'medium';

    if (error instanceof Error) {
      message = error.message;
      details = {
        name: error.name,
        stack: error.stack
      };
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      message = error.message || error.error || '请求失败';
      code = error.code || error.status;
      details = error;
    }

    // 根据错误类型判断严重程度和是否可重试
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
      severity = 'medium';
      retryable = true;
    } else if (lowerMessage.includes('timeout')) {
      severity = 'medium';
      retryable = true;
    } else if (lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
      severity = 'high';
      retryable = false;
    } else if (lowerMessage.includes('not found')) {
      severity = 'medium';
      retryable = false;
    } else if (lowerMessage.includes('server') || lowerMessage.includes('internal')) {
      severity = 'high';
      retryable = true;
    } else if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
      severity = 'medium';
      retryable = false;
    }

    // 根据HTTP状态码判断
    if (typeof code === 'number') {
      if (code >= 500) {
        severity = 'high';
        retryable = true;
      } else if (code >= 400 && code < 500) {
        severity = code === 429 ? 'medium' : 'high'; // 429 Too Many Requests 可重试
        retryable = code === 429 || code === 408; // 408 Request Timeout 可重试
      }
    }

    return {
      message,
      code,
      details,
      timestamp: new Date().toISOString(),
      retryable,
      severity
    };
  }, []);

  // 设置错误
  const setError = useCallback((error: any) => {
    const errorInfo = analyzeError(error);
    
    setState(prev => ({
      ...prev,
      error: errorInfo,
      isLoading: false
    }));

    // 调用外部错误处理器
    if (onError) {
      onError(errorInfo);
    }

    // 记录错误到控制台
    console.error('Error handled by useErrorHandler:', {
      error: errorInfo,
      originalError: error
    });
  }, [analyzeError, onError]);

  // 清除错误
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
      retryCount: 0
    }));
  }, []);

  // 重试操作
  const retry = useCallback(async (operation: () => Promise<any>) => {
    if (!state.error?.retryable || state.retryCount >= maxRetries) {
      if (state.retryCount >= maxRetries && onMaxRetriesReached) {
        onMaxRetriesReached();
      }
      return;
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      retryCount: prev.retryCount + 1
    }));

    // 调用重试回调
    if (onRetry) {
      onRetry(state.retryCount + 1);
    }

    // 延迟重试
    if (retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay * (state.retryCount + 1)));
    }

    try {
      const result = await operation();
      
      // 成功后清除错误
      setState(prev => ({
        ...prev,
        error: null,
        isLoading: false,
        retryCount: 0
      }));

      return result;
    } catch (error) {
      setError(error);
      throw error;
    }
  }, [state.error, state.retryCount, maxRetries, retryDelay, onRetry, onMaxRetriesReached, setError]);

  // 执行操作（带错误处理）
  const execute = useCallback(async (operation: () => Promise<any>) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await operation();
      setState(prev => ({ ...prev, isLoading: false }));
      return result;
    } catch (error) {
      setError(error);
      throw error;
    }
  }, [setError]);

  // 获取用户友好的错误消息
  const getUserFriendlyMessage = useCallback((error?: ErrorInfo): string => {
    if (!error) return '';

    const { message, code } = error;
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
      return '网络连接失败，请检查网络设置后重试';
    }

    if (lowerMessage.includes('timeout')) {
      return '请求超时，请稍后重试';
    }

    if (lowerMessage.includes('unauthorized')) {
      return '身份验证失败，请重新登录';
    }

    if (lowerMessage.includes('forbidden')) {
      return '权限不足，无法执行此操作';
    }

    if (lowerMessage.includes('not found')) {
      return '请求的资源不存在';
    }

    if (lowerMessage.includes('server') || lowerMessage.includes('internal')) {
      return '服务器内部错误，请稍后重试';
    }

    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
      return '输入数据无效，请检查后重试';
    }

    if (typeof code === 'number') {
      if (code === 429) {
        return '请求过于频繁，请稍后重试';
      }
      if (code >= 500) {
        return '服务器错误，请稍后重试';
      }
      if (code >= 400) {
        return '请求错误，请检查输入';
      }
    }

    return message || '操作失败，请重试';
  }, []);

  return {
    // 状态
    error: state.error,
    isLoading: state.isLoading,
    retryCount: state.retryCount,
    canRetry: state.error?.retryable && state.retryCount < maxRetries,
    
    // 操作
    setError,
    clearError,
    retry,
    execute,
    
    // 工具函数
    getUserFriendlyMessage,
    
    // 便捷属性
    hasError: !!state.error,
    errorMessage: getUserFriendlyMessage(state.error),
    errorSeverity: state.error?.severity || 'medium'
  };
}

export default useErrorHandler;
