// components/UI/Toast.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { X } from 'lucide-react';
import PropTypes from 'prop-types';

// Toast 组件，用于渲染多个 Toast 消息
const Toast = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
      {toasts.map(({ id, message, type }) => {
        // 根据 Toast 类型设置背景颜色
        const bgColor = {
          success: 'bg-green-500',
          error: 'bg-red-500',
          info: 'bg-theme-500',
          warning: 'bg-yellow-500'
        }[type] || 'bg-gray-500';
    
        return (
          <div
            key={id}
            className={`flex items-center ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg`}
          >
            <span>{message}</span>
            <button
              onClick={() => removeToast(id)}
              className="ml-2 focus:outline-none"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// 定义 PropTypes 以确保组件接收正确的 props
Toast.propTypes = {
  toasts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['success', 'error', 'info', 'warning']).isRequired
  })).isRequired,
  removeToast: PropTypes.func.isRequired
};

// 管理 Toast 状态的组件
const ToastManager = () => {
  const [toasts, setToasts] = useState([]);
  
  // 添加新的 Toast
  const addToast = useCallback(({ id, message, type }) => {
    setToasts(prev => [...prev, { id, message, type }]);
    
    // 设置自动移除 Toast 的定时器
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 2000); // Toast 显示 3 秒后自动消失
  }, []);
  
  // 移除指定的 Toast
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);
  
  // 将 addToast 函数暴露给外部
  useEffect(() => {
    ToastService.add = addToast;
  }, [addToast]);
  
  return <Toast toasts={toasts} removeToast={removeToast} />;
};

// 创建 Toast 服务，用于在应用的任意位置调用 Toast
const ToastService = {
  add: () => {} // 初始为空，稍后由 ToastManager 设置
};

// 创建 Toast 容器，并确保只创建一次
const createToastContainer = () => {
  if (document.getElementById('toast-container')) return; // 避免重复创建
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<ToastManager />);
};

// 显示 Toast 的函数
const showToast = ({ message, type = 'info' }) => {
  if (!ToastService.add) {
    // 如果 Toast 容器尚未创建，则先创建
    createToastContainer();
  }
  
  // 生成唯一的 ID
  const id = `${Date.now()}-${Math.random()}`;
  
  // 调用 ToastManager 的 addToast 函数
  ToastService.add({ id, message, type });
};

// Hook，用于在组件中使用 Toast（仅供组件使用）
export const useToast = () => ({
  toast: showToast
});

export { showToast };

export default Toast;
