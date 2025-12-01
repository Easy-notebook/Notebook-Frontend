import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationToastProps {
  id: string | number;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  onDismiss: (id: string | number) => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 3000,
  onDismiss,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const endTime = startTime + duration;

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const newProgress = (remaining / duration) * 100;

      setProgress(newProgress);

      if (remaining <= 0) {
        clearInterval(timer);
        onDismiss(id);
      }
    }, 10);

    return () => clearInterval(timer);
  }, [duration, id, onDismiss]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative w-full max-w-sm overflow-hidden rounded-xl border border-white/20 bg-white/60 dark:bg-black/60 backdrop-blur-xl shadow-lg"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0 pt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
          {message && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 break-words">{message}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(id)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 h-1 bg-gray-200 dark:bg-gray-700 w-full">
        <div
          className={`h-full transition-all duration-75 ease-linear ${
            type === 'success'
              ? 'bg-green-500'
              : type === 'error'
                ? 'bg-red-500'
                : type === 'warning'
                  ? 'bg-yellow-500'
                  : 'bg-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
};

export default NotificationToast;
